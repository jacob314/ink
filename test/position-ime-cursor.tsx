import test from 'ava';
import ansiEscapes from 'ansi-escapes';
import {positionImeCursor} from '../src/log-update.js';

test('positionImeCursor - first line', t => {
	const result = positionImeCursor(3, {row: 0, col: 5});
	// LineCount=3, row=0. moveUp = 3 - 1 - 0 = 2.
	t.is(result, ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5));
});

test('positionImeCursor - middle line', t => {
	const result = positionImeCursor(3, {row: 1, col: 2});
	// LineCount=3, row=1. moveUp = 3 - 1 - 1 = 1.
	t.is(result, ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(2));
});

test('positionImeCursor - last line', t => {
	const result = positionImeCursor(3, {row: 2, col: 10});
	// LineCount=3, row=2. moveUp = 3 - 1 - 2 = 0.
	t.is(result, ansiEscapes.cursorTo(10));
});
