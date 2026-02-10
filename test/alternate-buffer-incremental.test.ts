import test from 'ava';
import ansiEscapes from 'ansi-escapes';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';

test('switching back from alternate buffer does NOT trigger a full render clear', async t => {
	const columns = 80;
	const rows = 10;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows,
		columns,
	} as unknown as NodeJS.WriteStream;

	const worker = new TerminalBufferWorker(columns, rows, {stdout});

	// 1. Initial render
	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 1,
			lines: {
				updates: [],
				totalLength: 0,
			},
		},
	]);
	await worker.render();
	output = '';

	// 2. Toggle to alternate buffer
	worker.updateOptions({isAlternateBufferEnabled: true});
	await worker.render();
	output = '';

	// 3. Toggle back to normal buffer
	worker.updateOptions({isAlternateBufferEnabled: false});
	await worker.render();

	// Check if a full render was scheduled
	t.falsy(
		worker.fullRenderTimeout,
		'Full render should NOT be scheduled when exiting alternate buffer',
	);

	const hadClearInInitialRender =
		output.includes(ansiEscapes.eraseScreen) ||
		output.includes(ansiEscapes.clearTerminal);
	t.false(hadClearInInitialRender, 'Should not have cleared');
	output = '';

	// Wait a bit to be sure no delayed clear happens
	await new Promise(resolve => {
		setTimeout(resolve, 1100);
	});

	const hadClearLater =
		output.includes(ansiEscapes.eraseScreen) ||
		output.includes(ansiEscapes.clearTerminal);
	t.false(hadClearLater, 'Should still not have cleared even after 1.1s');
});
