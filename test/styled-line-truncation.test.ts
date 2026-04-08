import test from 'ava';
import {StyledLine} from '../src/styled-line.js';
import {BOLD_MASK} from '../src/tokenize.js';

const MAX_SAFE_OFFSET = 0x7f_ff;

test('StyledLine.empty does not cap length', t => {
	const line = StyledLine.empty(MAX_SAFE_OFFSET + 100);
	t.is(line.length, MAX_SAFE_OFFSET + 100);
	t.is(line.getText().length, MAX_SAFE_OFFSET + 100);
});

test('StyledLine constructor does not truncate massive input', t => {
	const massiveValues = Array.from({length: MAX_SAFE_OFFSET + 10}, () => 'a');
	const line = StyledLine.legacyCreateStyledLine(massiveValues);

	t.is(line.length, MAX_SAFE_OFFSET + 10);
	t.is(line.getValue(MAX_SAFE_OFFSET - 1), 'a');
	t.is(line.getText().length, MAX_SAFE_OFFSET + 10);
});

test('pushChar does not truncate', t => {
	const line = StyledLine.empty(MAX_SAFE_OFFSET - 2);

	// Add one more char
	line.pushChar('x', BOLD_MASK);
	t.is(line.length, MAX_SAFE_OFFSET - 1);
	t.is(line.getValue(MAX_SAFE_OFFSET - 2), 'x');

	// Add a 2-char string that would exceed the limit
	line.pushChar('yz', BOLD_MASK);
	t.is(line.length, MAX_SAFE_OFFSET);
	t.is(line.getValue(MAX_SAFE_OFFSET - 1), 'yz');

	// Try to add more
	line.pushChar('!', 0);
	t.is(line.length, MAX_SAFE_OFFSET + 1);
	t.is(line.getValue(MAX_SAFE_OFFSET), '!');
});

test('setChar does not truncate', t => {
	const line = StyledLine.empty(MAX_SAFE_OFFSET);

	// Replacing a 1-char space with a 2-char string should not truncate
	line.setChar(10, 'AB', 0);
	t.is(line.getValue(10), 'AB');
	t.is(line.getText().length, MAX_SAFE_OFFSET + 1);
});

test('combine does not truncate', t => {
	const line1 = StyledLine.empty(MAX_SAFE_OFFSET - 5);
	const line2 = StyledLine.empty(10);

	const result = line1.combine(line2);
	t.is(result.length, MAX_SAFE_OFFSET + 5);
	t.is(result.getValue(MAX_SAFE_OFFSET - 1), ' ');
});
