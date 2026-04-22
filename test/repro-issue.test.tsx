import {PassThrough} from 'node:stream';
import test from 'ava';
import React from 'react';
import xtermHeadless from '@xterm/headless';
import instances from '../src/instances.js';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/sticky/sticky.js';
import {waitFor} from './helpers/wait-for.js';

const {Terminal: XtermTerminal} = xtermHeadless;

const createTestEnv = (
	rows = 20,
	columns = 80,
	options: Record<string, unknown> = {},
) => {
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
	});

	let writeCount = 0;
	const stdout = {
		columns,
		rows,
		write(chunk: string) {
			term.write(chunk);
			writeCount++;
			return true;
		},
		on() {},
		off() {},
		removeListener() {},
		end() {},

		isTTY: true,
	} as unknown as NodeJS.WriteStream;

	const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
	(stdin as any).setRawMode = () => stdin;
	(stdin as any).isRawModeSupported = true;
	(stdin as any).isTTY = true;
	(stdin as any).resume = () => stdin;
	(stdin as any).pause = () => stdin;
	(stdin as any).ref = () => stdin;
	(stdin as any).unref = () => stdin;

	const {unmount} = render(<ScrollableContent />, {
		stdout,
		stdin,
		patchConsole: false,
		terminalBuffer: true,
		renderProcess: false, // Run in-process for easier debugging
		debugRainbow: true,
		...options,
	});

	const press = async (key: string) => {
		const currentCount = writeCount;
		switch (key) {
			case 'up': {
				stdin.push('\u001B[A');
				break;
			}

			case 'down': {
				stdin.push('\u001B[B');
				break;
			}

			case 'space': {
				stdin.push(' ');
				break;
			}

			default: {
				stdin.push(key);
			}
		}

		await waitFor(() => writeCount > currentCount);
	};

	const getLine = (row: number) => {
		return (
			term.buffer.active
				.getLine(term.buffer.active.baseY + row)
				?.translateToString(true) ?? ''
		);
	};

	const getFullContent = () => {
		let res = '';
		for (let i = 0; i < rows; i++) {
			res += getLine(i) + '\n';
		}

		return res;
	};

	return {
		term,
		stdin,
		unmount,
		press,
		getLine,
		getFullContent,
	};
};

test('repro issue: sticky headers and spurious renders', async t => {
	const env = createTestEnv(20, 80);

	// 1. Press space 5 times to add messages
	for (let i = 0; i < 5; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('space');
	}

	// 2. Scroll up to a position where Header 4 (starts at ~160 in actual lines) is stuck.
	// We'll scroll up 50 lines from the bottom (193 - 50 = 143).
	for (let i = 0; i < 50; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('up');
	}

	// 3. Toggle sticky headers ON
	await env.press('h');

	// Wait for the backbuffer delay to expire (1000ms by default in terminal-writer)
	await new Promise(resolve => {
		setTimeout(resolve, 1500);
	});

	const instance = instances.get(env.stdout as unknown as NodeJS.WriteStream);
	const termBuffer = (
		instance as unknown as {
			terminalBuffer: {lines: Array<{getText: () => string}>};
		}
	)?.terminalBuffer;

	let contentAfterHon = '';
	if (termBuffer?.lines && termBuffer.lines.length > 0) {
		contentAfterHon = termBuffer.lines
			.map(l => l.getText().trimEnd())
			.join('\n');
	} else {
		contentAfterHon = env.getFullContent();
	}

	t.log('Content after pressing H (on):\n' + contentAfterHon);

	// Assertion 1: Sticky footer should be visible when stuck to the terminal bottom
	t.true(
		contentAfterHon.replaceAll(/\s+/g, '').includes('StickyFooter0'),
		'Sticky Footer 0 should be visible (stuck to bottom) when stickyHeadersInBackbuffer is on',
	);

	// 4. Toggle sticky headers OFF
	await env.press('h');

	await new Promise(resolve => {
		setTimeout(resolve, 1500);
	});

	let contentAfterHoff = '';
	if (termBuffer?.lines && termBuffer.lines.length > 0) {
		contentAfterHoff = termBuffer.lines
			.map(l => l.getText().trimEnd())
			.join('\n');
	} else {
		contentAfterHoff = env.getFullContent();
	}

	t.log('Content after pressing H (off):\n' + contentAfterHoff);

	// Assertion 2: Sticky header should NOT be visible when toggled off
	t.false(
		contentAfterHoff.includes('Header 0 (sticky top)'),
		'Header 0 (sticky top) should not be visible when stickyHeadersInBackbuffer is off',
	);
	env.unmount();
});
