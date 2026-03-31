import test from 'ava';
import {wrapStyledChars} from '../src/text-wrap.js';
import {StyledLine} from '../src/styled-line.js';

test('does not add trailing spaces when wrapping at a space with styles', t => {
	const line = new StyledLine();
	line.pushChar('h', 0);
	line.pushChar('e', 0);
	line.pushChar('l', 0);
	line.pushChar('l', 0);
	line.pushChar('o', 0);
	line.pushChar(' ', 1); // Space with some style (flag 1 for example)
	line.pushChar('w', 0);
	line.pushChar('o', 0);
	line.pushChar('r', 0);
	line.pushChar('l', 0);
	line.pushChar('d', 0);

	const rows = wrapStyledChars(line, 5);
	t.is(rows.length, 2);
	t.is(rows[0]!.length, 5); // "hello"
	t.is(rows[1]!.length, 5); // "world"
});

test('does not add trailing spaces when wrapping at a space without styles', t => {
	const line = new StyledLine();
	line.pushChar('h', 0);
	line.pushChar('e', 0);
	line.pushChar('l', 0);
	line.pushChar('l', 0);
	line.pushChar('o', 0);
	line.pushChar(' ', 0); // Space without style
	line.pushChar('w', 0);
	line.pushChar('o', 0);
	line.pushChar('r', 0);
	line.pushChar('l', 0);
	line.pushChar('d', 0);

	const rows = wrapStyledChars(line, 5);
	t.is(rows.length, 2);
	t.is(rows[0]!.length, 5); // "hello"
	t.is(rows[1]!.length, 5); // "world"
});
