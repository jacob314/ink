import test from 'ava';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import chalk from 'chalk';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {rainbowColors} from '../src/worker/terminal-writer.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal: XtermTerminal} = xtermHeadless;

// Force color support for testing rainbow colors
chalk.level = 3;

const serializer = new Serializer();

const createStyledChar = (char: string) => ({
	type: 'char' as const,
	value: char,
	fullWidth: false,
	styles: [],
});

const createStyledLine = (text: string) =>
	[...text].map(char => createStyledChar(char));

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('TerminalBufferWorker avoids rerendering stuck headers during scroll', async t => {
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

	// Enable rainbow debug and sticky headers in backbuffer to track stuck updates
	const worker = new TerminalBufferWorker(columns, rows, {
		stdout,
		debugRainbowEnabled: true,
		stickyHeadersInBackbuffer: true,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// 1. Initial State: Scrollable region with a sticky header
	const headerLines = [createStyledLine('HEADER')];
	const contentLines = [
		createStyledLine('Content 1'),
		createStyledLine('Content 2'),
		createStyledLine('Content 3'),
		createStyledLine('Content 4'),
		createStyledLine('Content 5'),
	];

	const allLines = [...headerLines, ...contentLines];
	const data = serializer.serialize(allLines);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 5,
			isScrollable: true,
			scrollTop: 0,
			stickyHeaders: [
				{
					nodeId: 1,
					type: 'top',
					lines: headerLines,
					styledOutput: headerLines,
					x: 0,
					y: 0,
					naturalRow: 0,
					startRow: 0,
					endRow: 1,
					scrollContainerId: 'root',
					isStuckOnly: false,
				},
			],
			lines: {
				updates: [{start: 0, end: 6, data}],
				totalLength: 6,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';

	// Capture initial colors
	const getBg = (row: number) => {
		const line = term.buffer.active.getLine(row);
		return line?.getCell(0)?.getBgColor();
	};

	const headerBgFrame0 = getBg(0);
	const contentBgFrame0 = getBg(1);

	t.not(headerBgFrame0, -1);
	t.is(headerBgFrame0, contentBgFrame0);

	// 2. Scroll: Increment scrollTop
	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			scrollTop: 1,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	// Verify header stayed and content shifted
	t.is(term.buffer.active.getLine(0)?.translateToString(true).trim(), 'HEADER');
	t.is(
		term.buffer.active.getLine(1)?.translateToString(true).trim(),
		'Content 2',
	);

	const headerBgFrame1 = getBg(0);
	const content5BgFrame1 = getBg(4);

	t.is(
		headerBgFrame1,
		headerBgFrame0,
		'STUCK HEADER should NOT have been updated',
	);
	t.not(
		content5BgFrame1,
		contentBgFrame0,
		'NEWLY APPEARED CONTENT should HAVE been updated',
	);
});

test('TerminalBufferWorker handles sticky footers during scroll', async t => {
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

	const contentLines = [
		createStyledLine('Content 1'),
		createStyledLine('Content 2'),
		createStyledLine('Content 3'),
		createStyledLine('Content 4'),
		createStyledLine('Content 5'),
	];
	const footerLines = [createStyledLine('FOOTER')];

	const allLines = [...contentLines, ...footerLines];
	const data = serializer.serialize(allLines);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 5,
			isScrollable: true,
			scrollTop: 0,
			stickyHeaders: [
				{
					nodeId: 2,
					type: 'bottom',
					lines: footerLines,
					styledOutput: footerLines,
					x: 0,
					y: 4,
					naturalRow: 10,
					startRow: 10,
					endRow: 11,
					scrollContainerId: 'root',
					isStuckOnly: false,
				},
			],
			lines: {
				updates: [{start: 0, end: 6, data}],
				totalLength: 11,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';

	const getBg = (row: number) => {
		const line = term.buffer.active.getLine(row);
		return line?.getCell(0)?.getBgColor();
	};

	const footerBgFrame0 = getBg(4);
	const contentBgFrame0 = getBg(0);

	// Scroll
	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			scrollTop: 1,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	t.is(term.buffer.active.getLine(4)?.translateToString(true).trim(), 'FOOTER');

	const footerBgFrame1 = getBg(4);
	const content3BgFrame1 = getBg(3);

	t.is(
		footerBgFrame1,
		footerBgFrame0,
		'STUCK FOOTER should NOT have been updated',
	);
	t.not(
		content3BgFrame1,
		contentBgFrame0,
		'NEWLY APPEARED CONTENT at Row 3 should HAVE been updated',
	);
});

test('TerminalBufferWorker handles headers scrolling off when stickyHeadersInBackbuffer is false', async t => {
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
		stickyHeadersInBackbuffer: false,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const headerLines = [createStyledLine('HEADER')];
	const contentLines = [
		createStyledLine('Content 1'),
		createStyledLine('Content 2'),
		createStyledLine('Content 3'),
		createStyledLine('Content 4'),
	];

	const allLines = [...headerLines, ...contentLines];
	const data = serializer.serialize(allLines);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 5,
			isScrollable: true,
			scrollTop: 0,
			stickyHeaders: [
				{
					nodeId: 1,
					type: 'top',
					lines: headerLines,
					styledOutput: headerLines,
					x: 0,
					y: 0,
					naturalRow: 0,
					startRow: 0,
					endRow: 1,
					scrollContainerId: 'root',
					isStuckOnly: false,
				},
			],
			lines: {
				updates: [{start: 0, end: 5, data}],
				totalLength: 5,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.getLine(0)?.translateToString(true).trim(), 'HEADER');

	// Scroll the REGION itself up
	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: -1,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	t.is(
		term.buffer.active.getLine(0)?.translateToString(true).trim(),
		'Content 1',
		'Header should have scrolled off, Row 0 should show Content 1',
	);
});

test('TerminalBufferWorker switches to stuckLines when stuck', async t => {
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
		stickyHeadersInBackbuffer: true,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const naturalLines = [createStyledLine('NATURAL')];
	const stuckLines = [createStyledLine('STUCK')];

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 5,
			isScrollable: true,
			scrollTop: 0,
			stickyHeaders: [
				{
					nodeId: 1,
					type: 'top',
					lines: naturalLines,
					stuckLines,
					styledOutput: naturalLines,
					x: 0,
					y: 0,
					naturalRow: 1, // Will stick when scrollTop >= 1
					startRow: 1,
					endRow: 2,
					scrollContainerId: 'root',
					isStuckOnly: false,
				},
			],
			lines: {
				updates: [
					{
						start: 0,
						end: 5,
						data: serializer.serialize([...naturalLines, ...naturalLines]),
					},
				],
				totalLength: 5,
			},
		},
	]);

	// Initial render, scrollTop = 0. Natural header at Row 1.
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(
		term.buffer.active.getLine(1)?.translateToString(true).trim(),
		'NATURAL',
	);

	// Scroll to scrollTop = 1. Header hits stuck position (Row 0).
	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			scrollTop: 1,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	// Verify alternate stuck lines rendered at stuck position
	t.is(term.buffer.active.getLine(0)?.translateToString(true).trim(), 'STUCK');
});

test('TerminalBufferWorker handles stuck headers with more lines than natural', async t => {
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
		stickyHeadersInBackbuffer: true,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const naturalLines = [createStyledLine('NATURAL')]; // 1 line
	const stuckLines = [
		createStyledLine('STUCK L1'),
		createStyledLine('STUCK L2'),
	]; // 2 lines

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 5,
			isScrollable: true,
			scrollTop: 1, // Already stuck
			stickyHeaders: [
				{
					nodeId: 1,
					type: 'top',
					lines: naturalLines,
					stuckLines,
					styledOutput: stuckLines,
					x: 0,
					y: 0,
					naturalRow: 1,
					startRow: 1,
					endRow: 2,
					scrollContainerId: 'root',
					isStuckOnly: false,
				},
			],
			lines: {
				updates: [
					{
						start: 0,
						end: 5,
						data: serializer.serialize([
							createStyledLine('Row 0'),
							createStyledLine('Row 1'),
							createStyledLine('Row 2'),
							createStyledLine('Row 3'),
							createStyledLine('Row 4'),
						]),
					},
				],
				totalLength: 5,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	// Verify both lines of the stuck header are rendered
	t.is(
		term.buffer.active.getLine(0)?.translateToString(true).trim(),
		'STUCK L1',
	);
	t.is(
		term.buffer.active.getLine(1)?.translateToString(true).trim(),
		'STUCK L2',
	);

	// Row 2 should show the content that wasn't masked.
	// Natural visible content at Row 2 is lines[scrollTop + 2] = Row 3.
	t.is(term.buffer.active.getLine(2)?.translateToString(true).trim(), 'Row 3');
});
