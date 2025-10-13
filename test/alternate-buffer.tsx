import test from 'ava';
import ansiEscapes from 'ansi-escapes';
import {run} from './helpers/run.js';

const enterSynchronizedOutput = '\u001B[?2026h';
const exitSynchronizedOutput = '\u001B[?2026l';

test('renders in alternate buffer and clears it on exit', async t => {
	const output = await run('alternate-buffer');

	t.true(
		output.includes(ansiEscapes.enterAlternativeScreen),
		'Should enter alternate screen',
	);
	t.true(
		output.includes(ansiEscapes.exitAlternativeScreen),
		'Should exit alternate screen',
	);
	t.true(
		output.includes(enterSynchronizedOutput),
		'Should enter synchronized output',
	);
	t.true(
		output.includes(exitSynchronizedOutput),
		'Should exit synchronized output',
	);
	t.true(
		output.includes(ansiEscapes.cursorTo(0, 0)),
		'Should move cursor to top-left',
	);
	t.true(output.includes(ansiEscapes.eraseScreen), 'Should erase screen');
	t.true(output.includes('Hello World'), 'Should render content');
});

test('does not use alternate buffer when disabled', async t => {
	const output = await run('alternate-buffer-off');

	t.false(output.includes(ansiEscapes.enterAlternativeScreen));
	t.false(output.includes(ansiEscapes.exitAlternativeScreen));
	t.false(output.includes(enterSynchronizedOutput));
	t.false(output.includes(exitSynchronizedOutput));
	t.true(output.includes('Hello World'));
});
