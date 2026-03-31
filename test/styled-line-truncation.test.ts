import test from 'ava';
import {StyledLine} from '../src/styled-line.js';
import {BOLD_MASK} from '../src/tokenize.js';

const MAX_SAFE_OFFSET = 0x7f_ff;

test('StyledLine.empty caps length', t => {
	const line = StyledLine.empty(MAX_SAFE_OFFSET + 100);
	t.is(line.length, MAX_SAFE_OFFSET);
	t.is(line.getText().length, MAX_SAFE_OFFSET);
});

test('StyledLine constructor truncates massive input and adds ellipsis', t => {
	const massiveValues = Array.from({length: MAX_SAFE_OFFSET + 10}, () => 'a');
	const line = StyledLine.legacyCreateStyledLine(massiveValues);

	t.is(line.length, MAX_SAFE_OFFSET);
	t.is(line.getValue(MAX_SAFE_OFFSET - 1), '…');
	t.is(line.getText().length, MAX_SAFE_OFFSET);
});

test('pushChar truncates and adds ellipsis', t => {
	const line = StyledLine.empty(MAX_SAFE_OFFSET - 2);
	// Currently length is 32765, text length is 32765.

	// Add one more char
	line.pushChar('x', BOLD_MASK);
	t.is(line.length, MAX_SAFE_OFFSET - 1);
	t.is(line.getValue(MAX_SAFE_OFFSET - 2), 'x');

	// Try to add a 2-char string that would exceed the limit
	line.pushChar('yz', BOLD_MASK);
	// It should add '…' instead of 'yz' because 32766 + 2 > 32767
	t.is(line.length, MAX_SAFE_OFFSET);
	t.is(line.getValue(MAX_SAFE_OFFSET - 1), '…');

	// Try to add more
	line.pushChar('!', 0);
	t.is(line.length, MAX_SAFE_OFFSET);
	t.is(line.getValue(MAX_SAFE_OFFSET - 1), '…');
});

test('setChar handles overflow', t => {
	const line = StyledLine.empty(MAX_SAFE_OFFSET);
	// Text is 32767 spaces.

	// Replacing a 1-char space with a 2-char string should truncate the replacement
	line.setChar(10, 'AB', 0);
	t.is(line.getValue(10), 'A');
	t.is(line.getText().length, MAX_SAFE_OFFSET);
});

test('combine respects limit', t => {
	const line1 = StyledLine.empty(MAX_SAFE_OFFSET - 5);
	const line2 = StyledLine.empty(10);

	const result = line1.combine(line2);
	t.is(result.length, MAX_SAFE_OFFSET);
	t.is(result.getValue(MAX_SAFE_OFFSET - 1), '…');
});
