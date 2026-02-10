import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalWriter} from '../src/worker/terminal-writer.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal: XtermTerminal} = xtermHeadless;

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createLine = (text: string) => ({
	styledChars: [...text].map(char => createStyledChar(char)),
	text,
	length: text.length,
	tainted: true,
});

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('TerminalWriter output matches xterm expectations for writeLines', async t => {
	const columns = 80;
	const rows = 24;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const line1 = createLine('Hello World');
	const line2 = createLine('Second Line');

	writer.writeLines([line1, line2]);
	writer.flush();

	// Console.log('Output:', JSON.stringify(output));
	await writeToTerm(term, output);

	// Verify the content of the first line
	const bufferLine1 = term.buffer.active.getLine(0);
	t.is(bufferLine1?.translateToString(true), 'Hello World');

	// Verify the content of the second line
	const bufferLine2 = term.buffer.active.getLine(1);
	t.is(bufferLine2?.translateToString(true), 'Second Line');
});

test('TerminalWriter output matches xterm expectations for syncLine (update)', async t => {
	const columns = 80;
	const rows = 24;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// Initial write
	const line1 = createLine('Initial');
	writer.writeLines([line1]);
	writer.flush();
	await writeToTerm(term, output);
	output = ''; // Reset output capture

	// Update the line
	const line1Updated = createLine('Updated');
	writer.syncLine(line1Updated, 0);
	writer.flush();
	await writeToTerm(term, output);

	const bufferLine1 = term.buffer.active.getLine(0);
	t.is(bufferLine1?.translateToString(true), 'Updated');
});

test('TerminalWriter output matches xterm expectations for scrollLines (up)', async t => {
	const columns = 80;
	const rows = 5; // Small terminal for easier testing
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// Fill the screen
	const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].map(text =>
		createLine(text),
	);
	writer.writeLines(lines);
	writer.flush();
	await writeToTerm(term, output);
	output = '';

	// Scroll up and add new line
	const newLine = createLine('Line 6');
	writer.scrollLines({
		start: 0,
		end: rows,
		linesToScroll: 1,
		lines: [...lines, newLine],
		direction: 'up',
	});
	writer.flush();
	await writeToTerm(term, output);

	t.is(term.buffer.active.getLine(0)?.translateToString(true), 'Line 2');
	t.is(term.buffer.active.getLine(4)?.translateToString(true), 'Line 6');
});

test('appendLinesBackbuffer pushes lines to xterm scrollback', async t => {
	const columns = 80;
	const rows = 10;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
	});

	// Fill screen
	const initialLines = Array.from({length: rows}).map((_, i) =>
		createLine(`Line ${i}`),
	);
	writer.writeLines(initialLines);
	writer.flush();
	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.baseY, 0, 'Initially no scrollback');

	// Append 5 lines to backbuffer
	const extraLines = Array.from({length: 5}).map((_, i) =>
		createLine(`Extra ${i}`),
	);
	writer.appendLinesBackbuffer(extraLines);
	writer.flush();
	await writeToTerm(term, output);

	// Check xterm scrollback
	t.is(term.buffer.active.baseY, 5, 'Should have 5 lines in scrollback');

	for (let i = 0; i < 5; i++) {
		const line = term.buffer.active.getLine(i);
		t.is(
			line?.translateToString(true),
			`Extra ${i}`,
			`Extra ${i} should be in scrollback`,
		);
	}
});

test('syncLine on first render moves cursor to row 0', async t => {
	const columns = 80;
	const rows = 10;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
	});

	// Pre-fill terminal with some history
	await writeToTerm(term, 'History 1\r\nHistory 2\r\nHistory 3');
	t.is(term.buffer.active.cursorY, 2);

	// First render using syncLine
	const line = createLine('Ink Row 0');
	writer.syncLine(line, 0);
	writer.flush();
	await writeToTerm(term, output);

	// This verifies that syncLine(..., 0) on a first render moves to row 0
	// which overwrites "History 1" if it's absolute.
	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Ink Row 0',
		'Overwrote History 1 because cursorTo(0, 0) was used',
	);
});
