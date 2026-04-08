import test from 'ava';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import xtermHeadless from '@xterm/headless';
import {Serializer} from '../src/serialization.js';
import {createStyledLine} from './helpers/replay-lib.js';

const {Terminal} = xtermHeadless;

test('TerminalBufferWorker scroll down without backbuffer', async t => {
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
	const serializer = new Serializer();

	const lines = Array.from({length: 20}, (_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const data = serializer.serialize(lines);

	worker.update(
		{
			id: 'root',
			children: [{id: 'scroll', children: []}],
		},
		[
			{
				id: 'root',
				y: 0,
				width: columns,
				height: rows,
				lines: {updates: [], totalLength: 0},
			},
			{
				id: 'scroll',
				y: 0,
				width: columns,
				height: rows,
				isScrollable: true,
				overflowToBackbuffer: false,
				scrollTop: 0,
				scrollHeight: 20,
				scrollWidth: columns,
				lines: {
					updates: [{start: 0, end: 20, data}],
					totalLength: 20,
				},
			},
		],
	);

	await worker.render();

	worker.update(
		{
			id: 'root',
			children: [{id: 'scroll', children: []}],
		},
		[
			{
				id: 'scroll',
				scrollTop: 1,
			},
		],
	);

	await worker.render();

	const term = new Terminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});
	await new Promise<void>(resolve => {
		term.write(output, resolve);
	});
	// Expect the screen to have lines 1 to 10
	t.is(
		term.buffer.active.getLine(9)?.translateToString(true).trim(),
		'Line 10',
	);
});
