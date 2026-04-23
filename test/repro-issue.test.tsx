import {PassThrough} from 'node:stream';
import test from 'ava';
import React from 'react';
import xtermHeadless from '@xterm/headless';
import {getTerminalBufferContent} from './helpers/terminal-buffer.js';
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

	const {unmount} = render(
		<ScrollableContent
			initialItems={options.initialItems as number | undefined}
		/>,
		{
			stdout,
			stdin,
			patchConsole: false,
			terminalBuffer: true,
			renderProcess: false, // Run in-process for easier debugging
			debugRainbow: true,
			...options,
		},
	);

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
		stdout,
		unmount,
		press,
		getLine,
		getFullContent,
	};
};

test('repro issue: sticky headers and spurious renders', async t => {
	// Use a small viewport (height 5) so that a group (height ~8) can span the entire viewport.
	const env = createTestEnv(5, 80, {initialItems: 2});

	// Collapse footer so the scrollable area has space
	await env.press('f');

	// 1. Press space 5 times to add messages
	for (let i = 0; i < 5; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('space');
	}

	// 2. Scroll up to a position where Header 4 (starts at ~160 in actual lines) is stuck.
	// We'll scroll up 48 lines from the bottom.
	for (let i = 0; i < 48; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('up');
	}

	// 3. Toggle sticky headers ON
	await env.press('h');

	// Wait for the render update to propagate
	try {
		await waitFor(() => {
			const content = getTerminalBufferContent(env.stdout as unknown as NodeJS.WriteStream) || env.getFullContent();
			const cleanContent = content.replaceAll(/\s+/g, '');
			return cleanContent.includes('StickyFooter11') && content.includes('Sticky Header 11 (sticky top)');
		});
	} catch {
		// Ignore timeout so the assertions below can provide descriptive failure messages
	}

	const contentAfterHon = getTerminalBufferContent(env.stdout as unknown as NodeJS.WriteStream) || env.getFullContent();

	t.log('Content after pressing H (on):\n' + contentAfterHon);

	// Assertion 1: Sticky footer should be visible when stuck to the terminal bottom
	t.true(
		contentAfterHon.replaceAll(/\s+/g, '').includes('StickyFooter11'),
		'Sticky Footer 11 should be visible (stuck to bottom)',
	);

	t.true(
		contentAfterHon.includes('Sticky Header 11 (sticky top)'),
		'Sticky Header 11 should be visible (stuck to top) when stickyHeadersInBackbuffer is on',
	);

	// 4. Toggle sticky headers OFF
	await env.press('h');

	// Wait for the render update to propagate
	try {
		await waitFor(() => {
			const content = getTerminalBufferContent(env.stdout as unknown as NodeJS.WriteStream) || env.getFullContent();
			return !content.includes('Sticky Header 11 (sticky top)');
		});
	} catch {
		// Ignore timeout so the assertions below can provide descriptive failure messages
	}

	const contentAfterHoff = getTerminalBufferContent(env.stdout as unknown as NodeJS.WriteStream) || env.getFullContent();

	t.log('Content after pressing H (off):\n' + contentAfterHoff);

	// Assertion 2: Sticky header should NOT be visible when toggled off
	t.false(
		contentAfterHoff.includes('Sticky Header 11 (sticky top)'),
		'Sticky Header 11 should not be visible when stickyHeadersInBackbuffer is off',
	);
	env.unmount();
});
