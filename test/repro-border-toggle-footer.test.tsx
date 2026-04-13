import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import test from 'ava';
import React from 'react';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import instances from '../src/instances.js';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/sticky/sticky.js';

const {Terminal: XtermTerminal} = xtermHeadless;

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

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

	const inkInstance = instances.get(stdout as unknown as NodeJS.WriteStream);
	t.truthy(inkInstance);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const worker = (inkInstance as any).terminalBuffer.workerInstance;
	t.truthy(worker);

	const waitForFrame = async () => {
		await new Promise(resolve => {
			setTimeout(resolve, 50);
		});
		await worker.waitForIdle();
		await writeToTerm(term, output);
	};

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

	await waitForFrame();
	output = '';

	stdin.push('t');
	await waitForFrame();

	const topBorder = `╭${'─'.repeat(columns - 2)}╮`;
	const bottomBorder = `╰${'─'.repeat(columns - 2)}╯`;
	t.false(
		output.includes(`${topBorder}\n`) || output.includes(`${bottomBorder}\n`),
		'border updates should not rely on newline after a full-width border line',
	);

	const borderedViewport = getViewport();
	t.true(
		borderedViewport.includes(
			'This is a demo showing a scrollable box with sticky headers.',
		) &&
			borderedViewport.includes(
				"Press 'e' to export current frame, 'r' to toggle recording (OFF)",
			),
		`footer should remain visible after enabling border.\n${borderedViewport.join('\n')}`,
	);

	output = '';
	stdin.push('t');
	await waitForFrame();

	const unborderedViewport = getViewport();
	t.true(
		unborderedViewport.includes(
			'This is a demo showing a scrollable box with sticky headers.',
		) &&
			unborderedViewport.includes(
				"Press 'e' to export current frame, 'r' to toggle recording (OFF)",
			),
		`footer should remain visible after disabling border.\n${unborderedViewport.join('\n')}`,
	);

	unmount();
});
