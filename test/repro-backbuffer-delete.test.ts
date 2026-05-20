import test from 'ava';
import {type StyledLine} from '../src/styled-line.js';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {type RegionNode, type RegionUpdate} from '../src/output.js';
import {createStyledLine} from './helpers/replay-lib.js';

const serializer = new Serializer();

const createSilentStdout = (columns: number, rows: number) =>
	({
		write() {
			return true;
		},
		on() {},
		rows,
		columns,
	}) as unknown as NodeJS.WriteStream;

const getRenderedText = (line: {styledChars: StyledLine} | undefined) =>
	line?.styledChars.getText().trimEnd() ?? '';

test('re-render is not triggered when lines above viewport are deleted and tail matches (small maxScrollbackLength)', async t => {
	const columns = 80;
	const rows = 5;
	const worker = new TerminalBufferWorker(columns, rows, {
		stdout: createSilentStdout(columns, rows),
		maxScrollbackLength: 5,
	});

	let rootNode: RegionNode = {
		id: 'root',
		children: [
			{
				id: 'list',
				children: [],
			},
		],
	};

	let lines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	
	let updates: RegionUpdate[] = [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
		},
		{
			id: 'list',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			isScrollable: true,
			overflowToBackbuffer: true,
			linesOffsetY: 0,
			scrollTop: 10,
			scrollHeight: 20,
			lines: {
				updates: [
					{
						start: 0,
						end: 20,
						data: serializer.serialize(lines) as unknown as Uint8Array,
					},
				],
				totalLength: 20,
			},
		},
	];

	// Initial render
	worker.update(rootNode, updates);
	await worker.render();

	t.false(worker.backbufferDirtyCurrentFrame);
	t.false(worker.backbufferDirty);

	// Now delete the first 5 lines
	lines = Array.from({length: 15}).map((_, i) =>
		createStyledLine(`Line ${i + 5}`),
	);
	
	updates = [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
		},
		{
			id: 'list',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			isScrollable: true,
			overflowToBackbuffer: true,
			linesOffsetY: 0,
			scrollTop: 5, // Camera moves up by 5
			scrollHeight: 15,
			lines: {
				updates: [
					{
						start: 0,
						end: 15,
						data: serializer.serialize(lines) as unknown as Uint8Array,
					},
				],
				totalLength: 15,
			},
		},
	];

	worker.update(rootNode, updates);
	await worker.render();

	// Check if backbuffer dirty was falsely triggered
	t.false(worker.backbufferDirtyCurrentFrame);
	t.false(worker.backbufferDirty);

	// Expected backbuffer has length 5 (capped)
	const state = worker.getExpectedState();
	t.is(state.backbuffer.length, 5);
	t.is(getRenderedText(state.backbuffer.at(-1)), 'Line 9');
});

test('re-render IS triggered when lines above viewport are deleted and fall within maxScrollbackLength', async t => {
	const columns = 80;
	const rows = 5;
	const worker = new TerminalBufferWorker(columns, rows, {
		stdout: createSilentStdout(columns, rows),
		maxScrollbackLength: 20, // Large scrollback length
	});

	let rootNode: RegionNode = {
		id: 'root',
		children: [
			{
				id: 'list',
				children: [],
			},
		],
	};

	let lines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	
	let updates: RegionUpdate[] = [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
		},
		{
			id: 'list',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			isScrollable: true,
			overflowToBackbuffer: true,
			linesOffsetY: 0,
			scrollTop: 10,
			scrollHeight: 20,
			lines: {
				updates: [
					{
						start: 0,
						end: 20,
						data: serializer.serialize(lines) as unknown as Uint8Array,
					},
				],
				totalLength: 20,
			},
		},
	];

	// Initial render
	worker.update(rootNode, updates);
	await worker.render();

	t.false(worker.backbufferDirtyCurrentFrame);
	t.false(worker.backbufferDirty);

	// Now delete the first 5 lines
	lines = Array.from({length: 15}).map((_, i) =>
		createStyledLine(`Line ${i + 5}`),
	);
	
	updates = [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
		},
		{
			id: 'list',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			isScrollable: true,
			overflowToBackbuffer: true,
			linesOffsetY: 0,
			scrollTop: 5, // Camera moves up by 5
			scrollHeight: 15,
			lines: {
				updates: [
					{
						start: 0,
						end: 15,
						data: serializer.serialize(lines) as unknown as Uint8Array,
					},
				],
				totalLength: 15,
			},
		},
	];

	worker.update(rootNode, updates);
	
	// `update` and `render` should correctly flag it as dirty because the 
	// actual terminal history has lines 0-9 (10 lines), but the app now only
	// has lines 5-9 in its history (5 lines). Because 5 < 20 (maxScrollbackLength),
	// the extra 5 lines in the terminal are stale and must be erased via a full render.
	await worker.render();

	t.true(worker.backbufferDirtyCurrentFrame || worker.backbufferDirty);
});