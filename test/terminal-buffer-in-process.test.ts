import {PassThrough} from 'node:stream';
import test from 'ava';
import TerminalBuffer from '../src/terminal-buffer.js';

test('TerminalBuffer uses in-process worker when renderInProcess is true', async t => {
	const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
	(stdout as any).columns = 20;
	(stdout as any).rows = 10;

	const buffer = new TerminalBuffer(20, 10, {
		renderInProcess: true,
		stdout,
	});
	buffer.update(0, 10, {
		id: 'root',
		x: 0,
		y: 0,
		width: 20,
		height: 10,
		lines: [],
		styledOutput: [],
		isScrollable: false,
		stickyHeaders: [],
		children: [],
	});
	await buffer.render();

	// Check if it writes something on init (it calls render())
	// The worker writes cursorHide immediately in constructor
	// And render() writes to stdout.

	const chunk = (stdout as unknown as PassThrough).read() as unknown;
	const output = chunk ? String(chunk) : undefined;
	t.truthy(output);

	t.true(output?.includes('\u001B[?25l')); // Cursor hide
});

test('TerminalBuffer uses fork by default', t => {
	const buffer = new TerminalBuffer(20, 10);
	// We can't easily check private properties, but we can ensure it doesn't crash
	// and hopefully spawns a process.
	// Access private property worker to verify it exists
	t.truthy((buffer as any).worker);
	t.falsy((buffer as any).workerInstance);
	buffer.destroy();
});
