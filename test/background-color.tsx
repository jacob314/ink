import test from 'ava';
import {type SinonSpy} from 'sinon';
import xtermHeadless from '@xterm/headless';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import logUpdate from '../src/log-update.js';
import createStdout from './helpers/create-stdout.js';

const {Terminal} = xtermHeadless;

test('incremental rendering in alternate buffer - correctly handles styled space at the end of a line', async t => {
	const stdout = createStdout();
	const columns = 10;
	const rows = 5;
	const render = logUpdate.create(stdout, {
		incremental: true,
		alternateBuffer: true,
		getColumns: () => columns,
		getRows: () => rows,
	});

	const term = new Terminal({
		cols: columns,
		rows,
		allowProposedApi: true,
	});

	// Red background escape sequence: \u001B[48;2;255;0;0m
	// Reset escape sequence: \u001B[0m
	const redSpace = '\u001B[48;2;255;0;0m \u001B[0m';

	// A line with 5 chars of text and 5 spaces with background color.
	const line = 'Hello' + redSpace.repeat(5);
	const styledLine: StyledChar[] = [
		...[...'Hello'].map(char => ({
			type: 'char' as const,
			value: char,
			styles: [] as string[],
		})),
		...Array.from({length: 5}, () => ({
			type: 'char' as const,
			value: ' ',
			styles: ['\u001B[48;2;255;0;0m'],
		})),
	];

	render(line, [styledLine]);

	// Update with a slightly different line to trigger incremental update.
	const newLine = 'Hella' + redSpace.repeat(5);
	const newStyledLine: StyledChar[] = [
		...[...'Hella'].map(char => ({
			type: 'char' as const,
			value: char,
			styles: [] as string[],
		})),
		...Array.from({length: 5}, () => ({
			type: 'char' as const,
			value: ' ',
			styles: ['\u001B[48;2;255;0;0m'],
		})),
	];

	render(newLine, [newStyledLine]);

	for (const call of (stdout.write as unknown as SinonSpy).getCalls()) {
		term.write(call.args[0] as string);
	}

	// Wait for terminal to process the input
	await new Promise(resolve => {
		term.write('', resolve);
	});

	// The active buffer should be the alternate buffer since logUpdate enabled it.
	const buffer = term.buffer.active;
	const termLine = buffer.getLine(0);
	t.truthy(termLine);

	let text = '';
	for (let i = 0; i < columns; i++) {
		text += termLine!.getCell(i)!.getChars();
	}

	t.is(text, 'Hella     ');

	// Verify background color of the first 5 characters (default)
	for (let i = 0; i < 5; i++) {
		const cell = termLine!.getCell(i);
		// Check for default background.
		t.true(
			cell!.isBgDefault(),
			`Cell at index ${i} should have default background mode`,
		);
	}

	// Verify background color of the last 5 characters (red)
	for (let i = 5; i < 10; i++) {
		const cell = termLine!.getCell(i);
		// \u001B[48;2;255;0;0m is RGB color 0xFF0000.
		t.true(
			cell!.isBgRGB(),
			`Cell at index ${i} should have RGB background mode`,
		);
		t.is(
			cell!.getBgColor(),
			0xff_00_00,
			`Cell at index ${i} should have red background`,
		);
	}
});
