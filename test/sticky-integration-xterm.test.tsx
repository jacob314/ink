import {PassThrough} from 'node:stream';
import test from 'ava';
import React from 'react';
import xtermHeadless from '@xterm/headless';
import delay from 'delay';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/sticky/sticky.js';

const {Terminal: XtermTerminal} = xtermHeadless;

const createTestEnv = (
	rows = 40,
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
		renderProcess: false,
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

	const getBufferLine = (row: number) => {
		return term.buffer.active.getLine(row)?.translateToString(true) ?? '';
	};

	const getFullContent = () => {
		let res = '';
		for (let i = 0; i < rows; i++) {
			res += getLine(i) + '\n';
		}

		return res;
	};

	const getBufferHeight = () => {
		return term.buffer.active.baseY + rows;
	};

	const getBackbufferHeight = () => {
		// xterm-headless baseY increases as lines are pushed to scrollback.
		// However, \u001B[3J clears history but DOES NOT reset baseY to 0.
		// It only clears the lines in history.
		// We need to check how many lines in history are non-empty.
		let count = 0;
		for (let i = 0; i < term.buffer.active.baseY; i++) {
			const line = term.buffer.active.getLine(i)?.translateToString(true).trim();
			if (i < 10) {
				console.log(`[BACKBUFFER-DEBUG] Line ${i}: "${line}"`);
			}
			if (line && line !== '') {
				count++;
			}
		}

		return count;
	};

	return {
		term,
		stdin,
		unmount,
		press,
		getLine,
		getBufferLine,
		getFullContent,
		getBufferHeight,
		getBackbufferHeight,
		wait: delay,
	};
};

test('examples/sticky - pressing space twice scrolls to bottom and does not crash', async t => {
	const env = createTestEnv(40, 80);

	// Wait for initial render
	await env.wait(500);

	// Press space 3 times
	for (let i = 0; i < 3; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('space');
		// eslint-disable-next-line no-await-in-loop
		await env.wait(1000);
	}

	await env.wait(2000); // Wait longer for scroll animations etc

	const fullContent = env.getFullContent();
	t.log('Full content:\n' + fullContent);

	t.true(fullContent.includes('ScrollTop:'), 'Should show ScrollTop status');

	t.pass();

	env.unmount();
});

test('examples/sticky - updating backbuffer when dirty', async t => {
	const env = createTestEnv(20, 80);
	await env.wait(500);

	// Press space twice to add items and scroll down
	await env.press('space');
	await env.wait(1000);
	await env.press('space');
	await env.wait(1000);

	// Now scroll back up repeatedly
	for (let i = 0; i < 60; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('up');
	}

	// At this point, the backbuffer is dirty
	// Wait for the full render (backbuffer update delay is 1000ms)
	await env.wait(2000);

	// Check the terminal buffer.
	const fullBufferHeight = env.getBufferHeight();
	const lines = [];
	for (let i = 0; i < fullBufferHeight; i++) {
		lines.push(env.getBufferLine(i));
	}

	// "Line 1" (at the very top) should only appear exactly once in the entire terminal buffer history
	const line1Count = lines.filter(l => l.trim() === 'Line 1').length;
	t.is(
		line1Count,
		1,
		'Line 1 should appear exactly once in the entire terminal buffer',
	);

	env.unmount();
});

test('examples/sticky - sticky footer verification', async t => {
	const env = createTestEnv(20, 80);
	await env.wait(500);

	// Add items and scroll down
	await env.press('space');
	await env.wait(1000);
	await env.press('space');
	await env.wait(1000);

	// Scroll up until we see "Footer 1 (sticky bottom)"
	let found = false;
	for (let i = 0; i < 100; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('up');
		const content = env.getFullContent();
		if (content.includes('Footer 1 (sticky bottom)')) {
			found = true;
			break;
		}
	}

	t.true(found, 'Should show Footer 1 sticky bottom after scrolling up');

	const content = env.getFullContent();
	t.log('Content with sticky footer:\n' + content);

	// Verify the separator line made of dashes (borderTop) and then the footer message
	const lines = content.split('\n');
	let foundFooterInLayout = false;
	for (let i = 0; i < lines.length - 1; i++) {
		if (
			lines[i]!.includes('───') &&
			lines[i + 1]!.includes('Footer 1 (sticky bottom)')
		) {
			foundFooterInLayout = true;
			break;
		}
	}

	t.true(
		foundFooterInLayout,
		'Should find separator line followed by sticky footer message',
	);

	env.unmount();
});

test('examples/sticky - fast backbuffer update after scrolling to top', async t => {
	// Use backbufferUpdateDelay of 1ms to keep it fast
	const env = createTestEnv(20, 80, {backbufferUpdateDelay: 1});
	await env.wait(500);

	// Press space twice to add items and scroll down
	await env.press('space');
	await env.wait(500);
	await env.press('space');
	await env.wait(500);

	t.true(env.getBackbufferHeight() > 10, 'Should have many lines in backbuffer');

	// Press 'w' 20 times to scroll up (30 lines each time) to ensure we reach the top
	for (let i = 0; i < 20; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('w');
	}

	// Wait a bit for the backbuffer update (1ms delay + processing time)
	// We might need a bit more time because it's a full render
	await env.wait(1000);

	t.is(
		env.getBackbufferHeight(),
		0,
		'Backbuffer should be fully cleared after scrolling back to the very top',
	);

	env.unmount();
});

test('examples/sticky - delayed backbuffer update verification', async t => {
	// Use a longer backbufferUpdateDelay
	const env = createTestEnv(20, 80, {backbufferUpdateDelay: 2000});
	await env.wait(500);

	// Press space twice to add items and scroll down
	await env.press('space');
	await env.wait(500);
	await env.press('space');
	await env.wait(500);

	const initialBackbufferHeight = env.getBackbufferHeight();
	t.true(initialBackbufferHeight > 10, 'Should have lines in backbuffer');

	// Scroll all the way up to make it dirty and reach the top
	for (let i = 0; i < 20; i++) {
		// eslint-disable-next-line no-await-in-loop
		await env.press('w');
	}

	// Wait 1 second - backbuffer should STILL be there because delay is 2000ms
	await env.wait(1000);
	t.is(
		env.getBackbufferHeight(),
		initialBackbufferHeight,
		'Backbuffer should NOT be cleared yet after 1s (delay is 2s)',
	);

	// Wait another 2 seconds - now it should be cleared
	await env.wait(2000);
	t.is(
		env.getBackbufferHeight(),
		0,
		'Backbuffer should be cleared after 2s delay has passed',
	);

	env.unmount();
});
