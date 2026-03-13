import test from 'ava';
import ansiEscapes from 'ansi-escapes';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';

test('TerminalBufferWorker restores cursor on done', t => {
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows: 24,
		columns: 80,
	} as unknown as NodeJS.WriteStream;

	const worker = new TerminalBufferWorker(80, 24, {stdout});

	// Clear output from constructor (which hides cursor)
	output = '';

	worker.done();

	t.true(
		output.includes(ansiEscapes.cursorShow),
		'Output should contain cursorShow escape sequence',
	);
});
