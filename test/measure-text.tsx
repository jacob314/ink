import test from 'ava';
import {stub} from 'sinon';
import stringWidth from 'string-width';
import {
	measureStyledChars,
	toStyledCharacters,
	styledCharsToString,
	setStringWidthFunction,
	wordBreakStyledChars,
} from '../src/measure-text.js';

const measureText = (text: string) =>
	measureStyledChars(toStyledCharacters(text));

test('measure "constructor"', t => {
	const {width} = measureText('constructor');
	t.is(width, 11);
});

test('measure simple emoji', t => {
	const {width} = measureText('🍕');
	t.is(width, 2);
});

test('measure emoji with skin tone modifier', t => {
	const {width} = measureText('👍🏽');
	t.is(width, 2);
});

test('measure emoji ZWJ sequence', t => {
	const {width} = measureText('👨‍👩‍👧‍👦');
	t.is(width, 2);
});

test('measure flags', t => {
	const {width} = measureText('🇺🇸');
	t.is(width, 2);
});

test('measure multiple flags', t => {
	const {width} = measureText('🇺🇸🇬🇧');
	t.is(width, 4);
});

test('measure combining marks', t => {
	const {width} = measureText('á'); // A + combining acute accent
	t.is(width, 1);
});

test('measure mixed content', t => {
	const {width} = measureText('hello 🌍!');
	t.is(width, 9); // 6 (hello ) + 2 (🌍) + 1 (!)
});

test('measure variation selectors', t => {
	// U+FE0F is Variation Selector-16 (emoji style)
	const {width} = measureText('❤️'); // Heavy black heart + VS16
	t.is(width, 2);
});

test('do not combine regular characters', t => {
	const chars = toStyledCharacters('ab');
	t.is(chars.length, 2);
	t.is(chars.getValue(0), 'a');
	t.is(chars.getValue(1), 'b');
});

test('combine emoji ZWJ sequence into single styled char', t => {
	const chars = toStyledCharacters('👨‍👩‍👧‍👦');
	t.is(chars.length, 1);
	t.is(chars.getValue(0), '👨‍👩‍👧‍👦');
});

test('combine flag sequence into single styled char', t => {
	const chars = toStyledCharacters('🇺🇸');
	t.is(chars.length, 1);
	t.is(chars.getValue(0), '🇺🇸');
});

test('handle tabs by expanding to 4 spaces', t => {
	const chars = toStyledCharacters('a\tb');
	// 'a' (1) + tab (4 spaces) + 'b' (1) = 6 chars
	t.is(chars.length, 6);
	t.is(chars.getValue(0), 'a');
	t.is(chars.getValue(1), ' ');
	t.is(chars.getValue(2), ' ');
	t.is(chars.getValue(3), ' ');
	t.is(chars.getValue(4), ' ');
	t.is(chars.getValue(5), 'b');
});

test('ignore backspaces', t => {
	const chars = toStyledCharacters('a\bb');
	// 'a' (1) + \b (skipped) + 'b' (1) = 2 chars
	t.is(chars.length, 2);
	t.is(chars.getValue(0), 'a');
	t.is(chars.getValue(1), 'b');
});

test.serial('handle string width function that throws', t => {
	const warn = stub(console, 'warn');
	const throwingFn = (_text: string) => {
		throw new Error('Test error');
	};

	setStringWidthFunction(throwingFn);

	try {
		const {width} = measureText('🍕');
		t.is(width, 1);
		t.true(warn.calledOnce);
		t.true(
			(warn.firstCall.args[0] as string).includes(
				'Failed to calculate string width',
			),
		);

		const {width: width2} = measureText('🍕');
		t.is(width2, 1);
		t.true(warn.calledOnce);
	} finally {
		setStringWidthFunction(stringWidth);
		warn.restore();
	}
});

test('group styled chars into words', t => {
	const chars = toStyledCharacters('hello world');
	const groups = wordBreakStyledChars(chars);

	t.is(groups.length, 3);
	t.is(styledCharsToString(groups[0]!), 'hello');
	t.is(styledCharsToString(groups[1]!), ' ');
	t.is(styledCharsToString(groups[2]!), 'world');
});

test('group styled chars with newlines', t => {
	const chars = toStyledCharacters('hello\nworld');
	const groups = wordBreakStyledChars(chars);

	t.is(groups.length, 3);
	t.is(styledCharsToString(groups[0]!), 'hello');
	t.is(styledCharsToString(groups[1]!), '\n');
	t.is(styledCharsToString(groups[2]!), 'world');
});

test('group styled chars with multiple spaces', t => {
	const chars = toStyledCharacters('a  b');
	const groups = wordBreakStyledChars(chars);

	t.is(groups.length, 4);
	t.is(styledCharsToString(groups[0]!), 'a');
	t.is(styledCharsToString(groups[1]!), ' ');
	t.is(styledCharsToString(groups[2]!), ' ');
	t.is(styledCharsToString(groups[3]!), 'b');
});
