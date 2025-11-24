import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
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

test('TerminalBufferWorker renders initial content correctly', async t => {
	const columns = 80;
	const rows = 24;
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

	const lines = [createStyledLine('Hello World'), createStyledLine('Line 2')];
	const data = serializer.serialize(lines);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 2,
			lines: {
				updates: [
					{
						start: 0,
						end: 2,
						data,
					},
				],
				totalLength: 2,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Hello World');
	t.is(term.buffer.active.getLine(1)?.translateToString(true), 'Line 2');
});

test('TerminalBufferWorker handles updates correctly', async t => {
	const columns = 80;
	const rows = 24;
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

	// Initial render
	const lines1 = [createStyledLine('Line 1')];
	const data1 = serializer.serialize(lines1);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 1,
			lines: {
				updates: [{start: 0, end: 1, data: data1}],
				totalLength: 1,
			},
		},
	]);
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 1');

	// Update render
	const lines2 = [createStyledLine('Updated Line 1')];
	const data2 = serializer.serialize(lines2);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			height: 1, // Replace first line
			lines: {
				updates: [{start: 0, end: 1, data: data2}],
				totalLength: 1,
			},
		},
	]);
	await worker.render();
	await writeToTerm(term, output);

	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Updated Line 1',
	);
});

test('TerminalBufferWorker handles scrolling correctly', async t => {
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

	// Fill screen
	const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].map(text =>
		createStyledLine(text),
	);
	const data1 = serializer.serialize(lines);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 5,
			lines: {
				updates: [{start: 0, end: 5, data: data1}],
				totalLength: 5,
			},
		},
	]);
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 1');
	t.is(term.buffer.active.getLine(4)?.translateToString(true), 'Line 5');

	// Append one line, should trigger scroll
	const newLines = [createStyledLine('Line 6')];
	const data2 = serializer.serialize(newLines);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 6,
			lines: {
				updates: [{start: 5, end: 6, data: data2}],
				totalLength: 6,
			},
		},
	]);
	await worker.render();
	await writeToTerm(term, output);

	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 2');
	t.is(term.buffer.active.getLine(4)?.translateToString(true), 'Line 6');
});