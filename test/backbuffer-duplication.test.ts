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

const writeToTerm = (term: Terminal, data: string): Promise<void> =>
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
		// console.log(`[DEBUG] updateScroll(${scrollTop}) -> baseY: ${term.buffer.active.baseY}`);
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
