import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {TerminalWriter} from '../src/worker/terminal-writer.js';

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

test('TerminalWriter applies debugRainbowColor in syncLine', async t => {
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(20, 5, stdout);
	writer.debugRainbowColor = 'red';

	const line = createLine('Hello');
	writer.syncLine(line, 0);
	await writer.slowFlush();

	// Check if output contains ansi color code for red background.
	// chalk.bgRed open is \u001B[41m
	t.true(
		output.includes('\u001B[41m') || output.includes('\u001B[41m'),
		`Output should contain red background code. Got: ${JSON.stringify(output)}`,
	);
	t.true(output.includes('Hello'));
});

test('TerminalWriter applies debugRainbowColor in writeLines', t => {
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(20, 5, stdout);
	writer.debugRainbowColor = 'blue';

	const line = createLine('World');
	writer.writeLines([line]);
	writer.flush();

	// Chalk.bgBlue open is \u001B[44m
	t.true(
		output.includes('\u001B[44m') || output.includes('\u001B[44m'),
		`Output should contain blue background code. Got: ${JSON.stringify(output)}`,
	);
	t.true(output.includes('World'));
});