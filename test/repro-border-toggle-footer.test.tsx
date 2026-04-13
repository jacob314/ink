import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import test from 'ava';
import React from 'react';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import instances from '../src/instances.js';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/sticky/sticky.js';
import {waitFor} from './helpers/wait-for.js';

const {Terminal: XtermTerminal} = xtermHeadless;

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

type InkWithTerminalBuffer = {
	terminalBuffer: {
		workerInstance: {
			waitForIdle: () => Promise<void>;
		};
	};
};

test('sticky example border toggle avoids full-width newline corruption and preserves footer', async t => {
	const rows = 37;
	const columns = 100;
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	let output = '';
	class Stdout extends EventEmitter {
		isTTY = true;

		get columns() {
			return columns;
		}

		get rows() {
			return rows;
		}

		getColorDepth() {
			return 24;
		}

		write(chunk: string) {
			output += chunk;
			return true;
		}
	}

	const stdout = new Stdout();
	const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
	(stdin as any).setRawMode = () => stdin;
	(stdin as any).isRawModeSupported = true;
	(stdin as any).isTTY = true;
	(stdin as any).resume = () => stdin;
	(stdin as any).pause = () => stdin;
	(stdin as any).ref = () => stdin;
	(stdin as any).unref = () => stdin;

	const {unmount} = render(
		<ScrollableContent rows={rows} columns={columns} />,
		{
			stdout: stdout as unknown as NodeJS.WriteStream,
			stdin,
			patchConsole: false,
			terminalBuffer: true,
			renderProcess: false,
			standardReactLayoutTiming: true,
			incrementalRendering: true,
			animatedScroll: true,
			backbufferUpdateDelay: 100,
			maxFps: 10_000,
		},
	);

	const inkInstance = instances.get(
		stdout as unknown as NodeJS.WriteStream,
	) as unknown as InkWithTerminalBuffer;
	t.truthy(inkInstance);
	const worker = inkInstance.terminalBuffer.workerInstance;
	t.truthy(worker);

	const getViewport = () => {
		const base = term.buffer.active.baseY;
		const lines: string[] = [];
		for (let i = 0; i < rows; i++) {
			lines.push(
				term.buffer.active.getLine(base + i)?.translateToString(true) ?? '',
			);
		}

		return lines;
	};

	let recentOutput = '';
	const pumpToTerminal = async () => {
		if (output) {
			recentOutput += output;
			const chunk = output;
			output = '';
			await writeToTerm(term, chunk);
		}
	};

	// Wait for initial render
	await waitFor(async () => {
		await worker.waitForIdle();
		await pumpToTerminal();
		const viewport = getViewport();
		return viewport.some(line =>
			line.includes(
				'This is a demo showing a scrollable box with sticky headers.',
			),
		);
	});

	recentOutput = '';
	stdin.push('t');

	// Wait for the border to render
	const topBorder = `╭${'─'.repeat(columns - 2)}╮`;
	const bottomBorder = `╰${'─'.repeat(columns - 2)}╯`;

	await waitFor(async () => {
		await worker.waitForIdle();
		await pumpToTerminal();
		const viewport = getViewport();
		return viewport.some(line => line.includes(topBorder));
	});

	t.false(
		recentOutput.includes(`${topBorder}\n`) ||
			recentOutput.includes(`${bottomBorder}\n`),
		'border updates should not rely on newline after a full-width border line',
	);

	const borderedViewport = getViewport();
	t.true(
		borderedViewport.some(line =>
			line.includes(
				'This is a demo showing a scrollable box with sticky headers.',
			),
		) &&
			borderedViewport.some(line =>
				line.includes(
					"Press 'e' to export current frame, 'r' to toggle recording (OFF)",
				),
			),
		`footer should remain visible after enabling border.\n${borderedViewport.join('\n')}`,
	);

	recentOutput = '';
	stdin.push('t');

	// Wait for the border to disappear
	await waitFor(async () => {
		await worker.waitForIdle();
		await pumpToTerminal();
		const viewport = getViewport();
		return !viewport.some(line => line.includes(topBorder));
	});

	const unborderedViewport = getViewport();
	t.true(
		unborderedViewport.some(line =>
			line.includes(
				'This is a demo showing a scrollable box with sticky headers.',
			),
		) &&
			unborderedViewport.some(line =>
				line.includes(
					"Press 'e' to export current frame, 'r' to toggle recording (OFF)",
				),
			),
		`footer should remain visible after disabling border.\n${unborderedViewport.join('\n')}`,
	);

	unmount();
});
