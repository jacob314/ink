import test from 'ava';
import {measureStyledChars, toStyledCharacters} from '../src/measure-text.js';

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
