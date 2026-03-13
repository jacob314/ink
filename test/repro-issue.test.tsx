import {PassThrough} from 'node:stream';
import test from 'ava';
import React from 'react';
import xtermHeadless from '@xterm/headless';
import delay from 'delay';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/sticky/sticky.js';

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

	const stdout = {
		columns,
		rows,
		write(chunk: string) {
			term.write(chunk);
			return true;
		},
		on() {},
		off() {},
		removeListener() {},
		end() {},
		// eslint-disable-next-line @typescript-eslint/naming-convention
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

		await delay(10);
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
		wait: delay,
	};
};

test('repro issue: sticky headers and spurious renders', async t => {
	const env = createTestEnv(20, 80);

	// 1. Press space 5 times to add messages
	for (let i = 0; i < 5; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('space');
		// eslint-disable-next-line no-await-in-loop
		await env.wait(200);
	}

	// 2. Scroll up to a position where Header 4 (starts at ~160 in actual lines) is stuck.
	// We'll scroll up 120 lines from the bottom (193 - 120 = 73).
	for (let i = 0; i < 120; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('up');
	}
	await env.wait(500);

	// 3. Toggle sticky headers ON
	await env.press('h');
	await env.wait(500);

	const contentAfterHon = env.getFullContent();
	t.log('Content after pressing H (on):\n' + contentAfterHon);

	// Assertion 1: Sticky header should be visible when stuck to the terminal top
	t.true(
		contentAfterHon.includes('Header 4'),
		'Header 4 should be visible (stuck to top) when stickyHeadersInBackbuffer is on',
	);

	// 4. Toggle sticky headers OFF
	await env.press('h');
	await env.wait(500);
	const contentAfterHoff = env.getFullContent();
	t.log('Content after pressing H (off):\n' + contentAfterHoff);

	// Assertion 2: Sticky header should NOT be visible when toggled off
	t.false(
		contentAfterHoff.includes('Header 4 (sticky top)'),
		'Header 4 (sticky top) should not be visible when stickyHeadersInBackbuffer is off',
	);

	env.unmount();
});
