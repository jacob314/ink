import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

const {Terminal: XtermTerminal} = xtermHeadless;
const serializer = new Serializer();

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createStyledLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('scrolling down, up, and down again does not duplicate lines in backbuffer', async t => {
	const columns = 80;
	const rows = 5;
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
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const totalLines = 10;
	const allLines = Array.from({length: totalLines}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const allLinesSerialized = serializer.serialize(allLines);

	const updateScroll = async (scrollTop: number) => {
		worker.update({id: 'root', children: [{id: 'scroll-box', children: []}]}, [
			{
				id: 'root',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
			},
			{
				id: 'scroll-box',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
				scrollTop,
				isScrollable: true,
				overflowToBackbuffer: true,
				lines: {
					updates: [{start: 0, end: totalLines, data: allLinesSerialized}],
					totalLength: totalLines,
				},
			},
		]);
		output = '';
		await worker.render();
		await writeToTerm(term, output);
		// Console.log(`[DEBUG] updateScroll(${scrollTop}) -> baseY: ${term.buffer.active.baseY}`);
	};

	// 1. Initial render (scrollTop: 0)
	await updateScroll(0);
	t.is(term.buffer.active.baseY, 0, 'Initially no scrollback');

	// 2. Scroll down 2 lines (scrollTop: 2)
	await updateScroll(1);
	await updateScroll(2);
	t.is(term.buffer.active.baseY, 2, 'Should have 2 lines in scrollback');
	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 0');
	t.is(term.buffer.active.getLine(1)?.translateToString(true), 'Line 1');

	// 3. Scroll up 1 line (scrollTop: 1)
	await updateScroll(1);
	t.is(
		term.buffer.active.baseY,
		2,
		'Still 2 lines in scrollback after scroll up',
	);

	// 4. Scroll down 1 line again (scrollTop: 2)
	await updateScroll(2);

	// VERIFY: Should still have only 2 lines in scrollback, NOT 3.
	t.is(
		term.buffer.active.baseY,
		2,
		'Should NOT have added a duplicate line to scrollback',
	);

	// Check scrollback content - should not have duplicates
	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Line 0',
		'Scrollback[0] should be Line 0',
	);
	t.is(
		term.buffer.active.getLine(1)?.translateToString(true),
		'Line 1',
		'Scrollback[1] should be Line 1',
	);
	// Explicitly check that there is no Line 2 in scrollback (it should be on screen)
	t.is(
		term.buffer.active.getLine(2)?.translateToString(true),
		'Line 2',
		'Scrollback[2] should be Line 2 (which is visible line 0)',
	);
	// Line 2 should be on screen (at baseY + 0)
	t.is(
		term.buffer.active
			.getLine(term.buffer.active.baseY)
			?.translateToString(true),
		'Line 2',
		'Visible line 0 should be Line 2',
	);
});

test('scrolling down 4, up 2, down 1', async t => {
	const columns = 80;
	const rows = 5;
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
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const totalLines = 20;
	const allLines = Array.from({length: totalLines}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const allLinesSerialized = serializer.serialize(allLines);

	const updateScroll = async (scrollTop: number) => {
		worker.update({id: 'root', children: [{id: 'scroll-box', children: []}]}, [
			{
				id: 'root',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
			},
			{
				id: 'scroll-box',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
				scrollTop,
				isScrollable: true,
				overflowToBackbuffer: true,
				lines: {
					updates: [{start: 0, end: totalLines, data: allLinesSerialized}],
					totalLength: totalLines,
				},
			},
		]);
		output = '';
		await worker.render();
		await writeToTerm(term, output);
	};

	await updateScroll(0);
	await updateScroll(4);
	t.is(term.buffer.active.baseY, 4, 'Pushed 4 lines');

	await updateScroll(2);
	t.is(term.buffer.active.baseY, 4, 'Still 4 lines after scroll up');

	await updateScroll(3);
	t.is(
		term.buffer.active.baseY,
		4,
		'Should not push since scrollTop 3 <= maxPushed 4',
	);

	await updateScroll(5);
	t.is(
		term.buffer.active.baseY,
		5,
		'Should push 1 more line (Line 4) since scrollTop 5 > maxPushed 4',
	);

	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 0');
	t.is(term.buffer.active.getLine(1)?.translateToString(true), 'Line 1');
	t.is(term.buffer.active.getLine(2)?.translateToString(true), 'Line 2');
	t.is(term.buffer.active.getLine(3)?.translateToString(true), 'Line 3');
	t.is(term.buffer.active.getLine(4)?.translateToString(true), 'Line 4');
});

test('fullRender does not duplicate lines in backbuffer', async t => {
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
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// Case: Root region itself is scrolling (cameraY > 0)
	const lines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const data = serializer.serialize(lines);

	const tree = {
		id: 'root',
		children: [],
	};

	// Initial render: cameraY should be 10 (20 lines - 10 rows)
	worker.update(tree, [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: 20,
			lines: {
				updates: [{start: 0, end: 20, data}],
				totalLength: 20,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';
	t.is(term.buffer.active.baseY, 10);

	// Trigger a full render
	await worker.fullRender();
	await writeToTerm(term, output);
	output = '';
	t.is(
		term.buffer.active.baseY,
		10,
		'Should not have pushed more lines to backbuffer during fullRender',
	);

	// Scroll down one more line (cameraY: 11)
	worker.update(tree, [
		{
			id: 'root',
			height: 21,
			lines: {
				updates: [
					{
						start: 20,
						end: 21,
						data: serializer.serialize([createStyledLine('Line 20')]),
					},
				],
				totalLength: 21,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';
	t.is(term.buffer.active.baseY, 11);
});

test('fullRender does not duplicate sub-region backbuffer lines', async t => {
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
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const regionId = 'scrollable';
	const lines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const data = serializer.serialize(lines);

	const tree = {
		id: 'root',
		children: [{id: regionId, children: []}],
	};

	// Initial render at scrollTop: 0
	worker.update(tree, [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
		},
		{
			id: regionId,
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			scrollTop: 0,
			scrollHeight: 20,
			isScrollable: true,
			overflowToBackbuffer: true,
			lines: {
				updates: [{start: 0, end: 20, data}],
				totalLength: 20,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';
	t.is(term.buffer.active.baseY, 0);

	// Scroll down 5 lines
	worker.update(tree, [
		{
			id: regionId,
			scrollTop: 5,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';
	t.is(term.buffer.active.baseY, 5);

	// Trigger a full render
	await worker.fullRender();
	await writeToTerm(term, output);
	output = '';
	t.is(
		term.buffer.active.baseY,
		5,
		'Should not have pushed more lines to backbuffer during fullRender',
	);

	// Scroll down 1 more line (scrollTop: 6)
	worker.update(tree, [
		{
			id: regionId,
			scrollTop: 6,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';
	t.is(term.buffer.active.baseY, 6);
});

test('scrolling oscillation with fullRender does not duplicate lines', async t => {
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

	const worker = new TerminalBufferWorker(columns, rows, {
		stdout,
		debugRainbowEnabled: true,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const regionId = 'scroll-box';
	const lines = Array.from({length: 20}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const data = serializer.serialize(lines);

	const tree = {
		id: 'root',
		children: [{id: regionId, children: []}],
	};

	const updateScroll = async (scrollTop: number) => {
		worker.update(tree, [
			{
				id: 'root',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
			},
			{
				id: regionId,
				x: 0,
				y: 0,
				width: columns,
				height: rows,
				scrollTop,
				isScrollable: true,
				overflowToBackbuffer: true,
				lines: {
					updates: [{start: 0, end: 20, data}],
					totalLength: 20,
				},
			},
		]);
		output = '';
		await worker.render();
		await writeToTerm(term, output);
	};

	// 1. Scroll down 5 lines
	await updateScroll(5);
	t.is(term.buffer.active.baseY, 5, 'Pushed 5 lines');
	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 0');

	// Get background colors of pushed lines
	const getBg = (row: number) =>
		term.buffer.active.getLine(row)?.getCell(0)?.getBgColor();
	const bg0_initial = getBg(0);
	const bg1_initial = getBg(1);
	t.truthy(bg0_initial);

	// 2. Trigger fullRender while scrolled down.
	// It should preserve baseY=5.
	output = '';
	await worker.fullRender();
	await writeToTerm(term, output);
	t.is(
		term.buffer.active.baseY,
		5,
		'History preserved after fullRender while scrolled',
	);
	t.is(
		getBg(0),
		bg0_initial,
		'Line 0 in history should NOT have been repainted in fullRender',
	);

	// 3. Scroll back to top
	await updateScroll(0);
	t.is(term.buffer.active.baseY, 5, 'Still 5 lines in history');

	// 4. Trigger fullRender while at top.
	output = '';
	await worker.fullRender();
	await writeToTerm(term, output);
	t.is(
		term.buffer.active.baseY,
		5,
		'History preserved after fullRender at top',
	);

	// 5. Scroll down 1 line (scrollTop 1)
	// These lines are already in history.
	// We should use optimized scroll (DL at top) but WITHOUT pushing to history again.
	await updateScroll(1);

	// If it pushed to history, baseY would increase.
	t.is(
		term.buffer.active.baseY,
		5,
		'Should NOT have pushed Line 0 again after fullRender oscillation',
	);

	t.is(
		getBg(0),
		bg0_initial,
		'Line 0 in history should still have original rainbow color',
	);

	// 6. Scroll down to 6. Should push exactly ONE line (Line 5).
	await updateScroll(6);
	t.is(
		term.buffer.active.baseY,
		6,
		'Should push exactly one line when exceeding maxPushed after oscillation',
	);
	t.is(
		getBg(0),
		bg0_initial,
		'Line 0 in history still should have original color',
	);
	t.is(
		getBg(5),
		term.buffer.active
			.getLine(term.buffer.active.baseY + term.rows - 1)
			?.getCell(0)
			?.getBgColor(),
		"Something is wrong if baseY changed but content didn't shift correctly",
	);
});
