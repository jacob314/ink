import test from 'ava';
import React from 'react';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {render, Box, Text} from '../src/index.js';

const {Terminal: XtermTerminal} = xtermHeadless;

const wait = async (ms: number) =>
	new Promise<void>(resolve => {
		setTimeout(resolve, ms);
	});

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('terminal cursor position with terminalBuffer enabled', async t => {
	const columns = 80;
	const termRows = 10;

	const term = new XtermTerminal({
		cols: columns,
		rows: termRows,
		allowProposedApi: true,
	});

	const stdout = {
		columns,
		rows: termRows,
		write(chunk: string) {
			term.write(chunk);
			return true;
		},
		on() {},
		off() {},
		removeListener() {},
		end() {},
		isTty: true,
	} as unknown as NodeJS.WriteStream;

	const {unmount} = render(
		<Box flexDirection="column">
			<Text>Line 1</Text>
			<Text>Line 2</Text>
			<Text terminalCursorFocus terminalCursorPosition={3}>
				Line 3 with cursor
			</Text>
		</Box>,
		{
			stdout,
			patchConsole: false,
			terminalBuffer: true,
			renderProcess: false,
		},
	);

	await wait(500);
	await writeToTerm(term, '');

	// Xterm cursor coordinates are 0-based.
	// Line 1 is row 0
	// Line 2 is row 1
	// Line 3 is row 2
	// "Line 3" -> "Lin" has length 3, so cursor should be at col 3 of row 2.

	t.is(
		term.buffer.active.baseY + term.buffer.active.cursorY,
		2,
		'Cursor row should be 2',
	);
	t.is(term.buffer.active.cursorX, 3, 'Cursor column should be 3');

	unmount();
});

test('terminal cursor position with scrolling in terminalBuffer', async t => {
	const columns = 80;
	const termRows = 5;

	const term = new XtermTerminal({
		cols: columns,
		rows: termRows,
		allowProposedApi: true,
	});

	const stdout = {
		columns,
		rows: termRows,
		write(chunk: string) {
			term.write(chunk);
			return true;
		},
		on() {},
		off() {},
		removeListener() {},
		end() {},
		isTty: true,
	} as unknown as NodeJS.WriteStream;

	const {unmount} = render(
		<Box flexDirection="column">
			<Text>Line 1</Text>
			<Text>Line 2</Text>
			<Text>Line 3</Text>
			<Text>Line 4</Text>
			<Text>Line 5</Text>
			<Text>Line 6</Text>
			<Text terminalCursorFocus terminalCursorPosition={5}>
				Line 7 with cursor
			</Text>
		</Box>,
		{
			stdout,
			patchConsole: false,
			terminalBuffer: true,
			renderProcess: false,
		},
	);

	await wait(500);
	await writeToTerm(term, '');

	// Total 7 lines, termRows is 5.
	// Camera should be at cameraY = 7 - 5 = 2.
	// Line 7 (index 6) should be at visible row index 6 - 2 = 4 (bottom of screen).
	// Cursor position 5 in "Line 7 with cursor" should be col 5.

	t.is(
		term.buffer.active.baseY + term.buffer.active.cursorY,
		4,
		'Cursor row should be 4 (relative to visible screen)',
	);
	t.is(term.buffer.active.cursorX, 5, 'Cursor column should be 5');

	unmount();
});
