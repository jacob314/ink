
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

		await delay(100);
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
		await env.press('space');
		await env.wait(200);
	}

	// 2. Scroll down 10 lines
	for (let i = 0; i < 10; i++) {
		await env.press('down');
	}

	await env.wait(500);

	// 3. Toggle sticky headers ON
	await env.press('h');
	await env.wait(500);
	
	const contentAfterHOn = env.getFullContent();
	t.log('Content after pressing H (on):\n' + contentAfterHOn);
	
	// Assertion 1: Sticky header should be visible when stuck to the terminal top
	// Header 4 is at row 80 in items. 
	// Each block is 20 lines. Header 0: 0-19, Header 1: 20-39, Header 2: 40-59, Header 3: 60-79, Header 4: 80-99.
	// We scrolled down 10 lines from the bottom (which was at row 100+ after 5 space presses).
	// Content height is ~180. We scrolled to ~170.
	// Header 4 is definitely above us.
	t.true(contentAfterHOn.includes('Header 4'), 'Header 4 should be visible (stuck to top) when stickyHeadersInBackbuffer is on');

	// 4. Toggle sticky headers OFF
	await env.press('h');
	await env.wait(500);
	const contentAfterHOff = env.getFullContent();
	t.log('Content after pressing H (off):\n' + contentAfterHOff);

	// Assertion 2: Sticky header should NOT be visible when toggled off
	t.false(contentAfterHOff.includes('Header 4 (sticky top)'), 'Header 4 (sticky top) should not be visible when stickyHeadersInBackbuffer is off');

	env.unmount();
});
