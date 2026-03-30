import test from 'ava';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {writeToTerm, createStyledLine} from './helpers/replay-lib.js';

const {Terminal: XtermTerminal} = xtermHeadless;
const serializer = new Serializer();

test('scrolling is efficient (only new lines are updated)', async t => {
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

	const totalLines = 50;
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
		worker.resetLinesUpdated();
		await worker.render();
		await writeToTerm(term, output);
		return worker.getLinesUpdated();
	};

	// 1. Initial render
	await updateScroll(0);
	t.is(worker.getLinesUpdated(), rows, 'Initial render should update all rows');

	// 2. Scroll down 2 lines
	const downUpdates = await updateScroll(2);
	// Ideally it should be 2, but scrollbar/border might add more.
	t.true(
		downUpdates <= 4,
		`Scrolling down 2 lines should be efficient (updated ${downUpdates} lines)`,
	);

	// 3. Scroll up 2 lines
	const upUpdates = await updateScroll(0);
	t.true(
		upUpdates <= 4,
		`Scrolling up 2 lines should be efficient (updated ${upUpdates} lines)`,
	);
});

test('scrolling is efficient even with scrollbars', async t => {
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

	const totalLines = 50;
	const allLines = Array.from({length: totalLines}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
	const allLinesSerialized = serializer.serialize(allLines);

	const renderFrame = async (scrollTop: number) => {
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
				scrollHeight: totalLines,
				isScrollable: true,
				isVerticallyScrollable: true,
				scrollbarVisible: true,
				overflowToBackbuffer: true,
				lines: {
					updates: [{start: 0, end: totalLines, data: allLinesSerialized}],
					totalLength: totalLines,
				},
			},
		]);
		output = '';
		worker.resetLinesUpdated();
		await worker.render();
		await writeToTerm(term, output);

		return worker.getLinesUpdated();
	};

	// 1. Initial render
	await renderFrame(0);

	// 2. Scroll down 1 line
	const updates = await renderFrame(1);
	t.log(`Updates for 1-line scroll: ${updates}`);

	// In an ideal world, it should be 1 (new line) + 1 (thumb update).
	// Let's expect <= 3.
	t.true(
		updates <= 3,
		`Scroll should be very efficient (updated ${updates} lines, expected <= 3)`,
	);
});
