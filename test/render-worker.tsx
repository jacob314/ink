/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

const serializer = new Serializer();

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));

class TestWorkerWrapper {
	lines: StyledChar[][] = [];

	constructor(public worker: TerminalBufferWorker) {}

	// Simulate an update (overwrite)
	update(start: number, newLines: StyledChar[][]) {
		// Update local model
		for (const [i, line] of newLines.entries()) {
			this.lines[start + i] = line!;
		}

		const data = serializer.serialize(newLines);

		this.worker.update({id: 'root', children: []}, [
			{
				id: 'root',
				height: this.lines.length,
				y: 0,
				lines: {
					updates: [
						{
							start,
							end: start + newLines.length,
							data,
						},
					],
					totalLength: this.lines.length,
				},
			},
		]);
	}

	append(newLines: StyledChar[][]) {
		const start = this.lines.length;
		this.lines.push(...newLines);
		const data = serializer.serialize(newLines);
		this.worker.update({id: 'root', children: []}, [
			{
				id: 'root',
				height: this.lines.length,
				y: 0,
				lines: {
					updates: [
						{
							start,
							end: start + newLines.length,
							data,
						},
					],
					totalLength: this.lines.length,
				},
			},
		]);
	}
}

test('TerminalBufferWorker correctly tracks backbufferDirty', t => {
	// 5 rows visible
	const worker = new TerminalBufferWorker(20, 5);
	const wrapper = new TestWorkerWrapper(worker);

	// Add 10 lines (0-9).
	// Visible: 5-9. Backbuffer: 0-4.
	const lines = Array.from({length: 10}, (_, i) => createLine(`Line ${i}`));
	wrapper.append(lines);

	t.true(worker.backbufferDirty);

	// Reset
	worker.backbufferDirty = false;
	worker.backbufferDirtyCurrentFrame = false;

	// Modify line 0 (Backbuffer, index 0 < 5)
	wrapper.update(0, [createLine('Line 0 Modified')]);

	t.true(
		worker.backbufferDirty,
		'Modifying backbuffer should set backbufferDirty',
	);

	// Reset
	worker.backbufferDirty = false;
	worker.backbufferDirtyCurrentFrame = false;

	// Modify line 8 (Visible, index 8 >= 5)
	wrapper.update(8, [createLine('Line 8 Modified')]);

	t.false(
		worker.backbufferDirty,
		'Modifying visible line should NOT set backbufferDirty',
	);

	// Append lines (scrolling)
	wrapper.append([createLine('Line 10'), createLine('Line 11')]);

	t.false(
		worker.backbufferDirty,
		'Appending lines should NOT set backbufferDirty',
	);

	// Modify at 2 (Backbuffer)
	wrapper.update(2, [createLine('Inserted')]);
	t.true(
		worker.backbufferDirty,
		'Modifying backbuffer should set backbufferDirty',
	);
});

test('TerminalBufferWorker avoids duplicate backbuffer lines on scroll oscillation', async t => {
	const worker = new TerminalBufferWorker(20, 5, {
		stdout: {write() {}} as any,
	});
	const {terminalWriter} = worker as any;

	const regionId = 'scrollable';
	const lines = Array.from({length: 20}, (_, i) => createLine(`Line ${i}`));
	const data = serializer.serialize(lines);

	const updateScroll = (scrollTop: number) => {
		worker.update(
			{
				id: 'root',
				children: [
					{
						id: regionId,
						children: [],
					},
				],
			},
			[
				{
					id: 'root',
					width: 20,
					height: 5,
					children: [regionId],
				} as any,
				{
					id: regionId,
					width: 20,
					height: 5,
					isScrollable: true,
					overflowToBackbuffer: true,
					scrollTop,
					scrollHeight: 20,
					lines: {
						updates: [
							{
								start: 0,
								end: 20,
								data,
							},
						],
						totalLength: 20,
					},
				} as any,
			],
		);
	};

	// Initial
	updateScroll(0);
	await worker.render();
	t.is(terminalWriter.backbuffer.length, 0);

	// Scroll down
	updateScroll(5);
	await worker.render();
	t.is(terminalWriter.backbuffer.length, 5);
	t.is(terminalWriter.backbuffer[4].text, 'Line 4');

	// Scroll up
	updateScroll(2);
	await worker.render();
	t.is(terminalWriter.backbuffer.length, 5);

	// Scroll down further
	updateScroll(6);
	await worker.render();
	t.is(terminalWriter.backbuffer.length, 6);
	t.is(terminalWriter.backbuffer[5].text, 'Line 5');
});
