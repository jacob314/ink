import test from 'ava';
import {StyledLine, StyledChar} from '../src/styled-line.js';
import {FULL_WIDTH_MASK, BOLD_MASK} from '../src/tokenize.js';

test('StyledLine handles empty creation', t => {
	const line = StyledLine.empty(5);
	t.is(line.length, 5);
	t.is(line.getValue(0), ' ');
	t.is(line.getValue(4), ' ');
});

test('StyledLine pushChar and get accessors', t => {
	const line = new StyledLine();
	line.pushChar('a', BOLD_MASK, 'red', 'blue', 'http://example.com');

	t.is(line.length, 1);
	t.is(line.getValue(0), 'a');
	t.true(line.hasStyles(0));
	t.is(line.getFormatFlags(0), BOLD_MASK);
	t.is(line.getFgColor(0), 'red');
	t.is(line.getBgColor(0), 'blue');
	t.is(line.getLink(0), 'http://example.com');
});

test('StyledLine span merging', t => {
	const line = new StyledLine();
	line.pushChar('a', BOLD_MASK, 'red');
	line.pushChar('b', BOLD_MASK, 'red');
	line.pushChar('c', 0, 'blue');

	const spans = line.getSpans();
	t.is(spans.length, 2);
	t.is(spans[0]!.length, 2);
	t.is(spans[1]!.length, 1);
});

test('StyledLine setChar splits and merges spans', t => {
	const line = new StyledLine();
	line.pushChar('a', 0);
	line.pushChar('b', 0);
	line.pushChar('c', 0);
	line.pushChar('d', 0);

	t.is(line.getSpans().length, 1);

	// Split in middle
	line.setChar(1, 'x', BOLD_MASK);
	t.is(line.getSpans().length, 3);
	t.is(line.getValue(1), 'x');
	t.is(line.getFormatFlags(1), BOLD_MASK);

	// Change next char to same style to test merge
	line.setChar(2, 'y', BOLD_MASK);
	t.is(line.getSpans().length, 3);
	t.is(line.getSpans()[1]!.length, 2);

	// Revert to match surrounding spans
	line.setChar(1, 'b', 0);
	line.setChar(2, 'c', 0);
	t.is(line.getSpans().length, 1);
});

test('StyledLine slice', t => {
	const line = new StyledLine();
	line.pushChar('a', BOLD_MASK);
	line.pushChar('b', BOLD_MASK);
	line.pushChar('c', 0);
	line.pushChar('d', 0);

	const sliced = line.slice(1, 3);
	t.is(sliced.length, 2);
	t.is(sliced.getValue(0), 'b');
	t.is(sliced.getFormatFlags(0), BOLD_MASK);
	t.is(sliced.getValue(1), 'c');
	t.is(sliced.getFormatFlags(1), 0);

	t.is(sliced.getSpans().length, 2);
});

test('StyledLine trimEnd', t => {
	const line = new StyledLine();
	line.pushChar('a', 0);
	line.pushChar(' ', 0);
	line.pushChar(' ', 0);

	const trimmed = line.trimEnd();
	t.is(trimmed.length, 1);
	t.is(trimmed.getValue(0), 'a');
});

test('StyledChar class compat', t => {
	const char = new StyledChar('x', BOLD_MASK, 'red', 'bg', 'link');
	t.is(char.getValue(), 'x');
	t.is(char.getForegroundColor(), 'red');
	t.is(char.getBackgroundColor(), 'bg');
	t.is(char.getLink(), 'link');
	t.true(char.getBold());

	const char2 = char.copyWith({value: 'y'});
	t.is(char2.getValue(), 'y');
	t.true(char2.getBold());
});
