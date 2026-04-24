import test from 'ava';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {createStyledLine} from './helpers/replay-lib.js';

const serializer = new Serializer();

test('scrolling inner container does not repaint lines below it', async t => {
	const columns = 40;
	const rows = 20;
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

	const innerLines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Inner Line ${i}`),
	);
	const innerLinesSerialized = serializer.serialize(innerLines);

	const outerLines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Outer Line ${i}`),
	);
	const outerLinesSerialized = serializer.serialize(outerLines);

	const renderFrame = async (innerScrollTop: number) => {
		worker.update(
			{
				id: 'root',
				children: [
					{
						id: 'outer',
						children: [{id: 'inner', children: []}],
					},
				],
			},
			[
				{
					id: 'root',
					x: 0,
					y: 0,
					width: columns,
					height: rows,
				},
				{
					id: 'outer',
					x: 0,
					y: 0,
					width: columns,
					height: rows,
					scrollTop: 0,
					scrollHeight: 40,
					isScrollable: true,
					overflowToBackbuffer: true,
					lines: {
						updates: [{start: 5, end: 25, data: outerLinesSerialized}],
						totalLength: 25,
					},
				},
				{
					id: 'inner',
					x: 0,
					y: 0,
					width: columns,
					height: 5,
					scrollTop: innerScrollTop,
					scrollHeight: 20,
					isScrollable: true,
					lines: {
						updates: [{start: 0, end: 20, data: innerLinesSerialized}],
						totalLength: 20,
					},
				},
			],
		);

		output = '';
		worker.resetLinesUpdated();
		await worker.render();
		return worker.getLinesUpdated();
	};

	// Initial render
	await renderFrame(0);
	t.is(worker.getLinesUpdated(), rows, 'Initial render should update all rows');

	// Scroll inner container by 1 line
	const updates = await renderFrame(1);

	t.true(updates <= 6, `Expected <= 6 lines to be updated, but got ${updates}`);
});
