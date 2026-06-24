import fs from 'node:fs';
import path from 'node:path';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {StyledLine} from '../../src/styled-line.js';
import {TerminalBufferWorker} from '../../src/worker/render-worker.js';
import {loadReplay} from '../../src/replay.js';
import {type RenderLine} from '../../src/worker/terminal-writer.js';

import {Serializer} from '../../src/serialization.js';
import {type RegionUpdate} from '../../src/output.js';

const {Terminal: XtermTerminal} = xtermHeadless;

const serializer = new Serializer();
type WorkerOptions = NonNullable<
	ConstructorParameters<typeof TerminalBufferWorker>[2]
>;

// eslint-disable-next-line max-params
export function createListUpdates(
	columns: number,
	rows: number,
	totalLength: number,
	scrollTop: number,
	startIndex = 0,
	linesOffsetY = 0,
): RegionUpdate[] {
	const lines = Array.from({length: totalLength}).map((_, i) =>
		createStyledLine(`Line ${i + startIndex}`),
	);

	return [
		{
			id: 'root',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			isScrollable: false,
		},
		{
			id: 'list',
			x: 0,
			y: 0,
			width: columns,
			height: rows,
			isScrollable: true,
			overflowToBackbuffer: true,
			linesOffsetY,
			scrollTop,
			scrollHeight: totalLength + linesOffsetY,
			lines: {
				updates: [
					{
						start: linesOffsetY,
						end: linesOffsetY + totalLength,
						data: serializer.serialize(lines),
					},
				],
				totalLength,
			},
		},
	];
}

export function getPlainText(line: RenderLine | undefined): string {
	if (!line) {
		return '';
	}

	// RenderLine.text contains ANSI codes. We want plain text for comparison with xterm buffer.
	return line.styledChars.getText().trimEnd();
}

export const getRenderedText = (line: {styledChars: StyledLine} | undefined) =>
	line?.styledChars.getText().trimEnd() ?? '';

export const createSilentStdout = (columns: number, rows: number) => {
	const stdout: Partial<NodeJS.WriteStream> = {
		write() {
			return true;
		},
		on() {},
		rows,
		columns,
	};

	return stdout as NodeJS.WriteStream;
};

export const writeToTerm = async (
	term: Terminal,
	data: string,
): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

export function loadReplayData(replayDir: string, filename: string) {
	const replayPath = path.join(replayDir, filename);
	const replayJson = fs.readFileSync(replayPath, 'utf8');
	return loadReplay(replayJson);
}

export function createWorkerAndTerminal(
	columns: number,
	rows: number,
	options: Readonly<Partial<WorkerOptions>> = {},
) {
	let output = '';
	const stdout: Partial<NodeJS.WriteStream> = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows,
		columns,
	};

	const worker = new TerminalBufferWorker(columns, rows, {
		stdout: stdout as NodeJS.WriteStream,
		isAlternateBufferEnabled: false,
		...options,
	});

	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	return {
		worker,
		term,
		getOutput: () => output,
		clearOutput() {
			output = '';
		},
	};
}

export async function waitForTerminalState(
	term: Terminal,
	worker: TerminalBufferWorker,
	timeout = 5000,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const expected = worker.getExpectedState();
		const buffer = term.buffer.active;

		// 1. Check Cursor Position
		// worker.cursorY is relative to the screen. xterm cursorY is also relative to viewport.
		if (
			(expected.cursorX !== -1 && buffer.cursorX !== expected.cursorX) ||
			(expected.cursorY !== -1 && buffer.cursorY !== expected.cursorY)
		) {
			// eslint-disable-next-line no-await-in-loop
			await new Promise(resolve => {
				setTimeout(resolve, 10);
			});
			continue;
		}

		// 2. Check Backbuffer Content
		let backbufferMatch = true;

		// In alternate buffer, xterm does not keep backbuffer.
		if (buffer.type !== 'alternate') {
			const workerBackbufferLen = expected.backbuffer.length;

			for (let i = 0; i < workerBackbufferLen; i++) {
				const expectedLine = getPlainText(expected.backbuffer[i]);
				const xtermLine =
					buffer.getLine(i)?.translateToString(true).trimEnd() ?? '';
				if (expectedLine !== xtermLine) {
					backbufferMatch = false;
					break;
				}
			}
		}

		if (!backbufferMatch) {
			// eslint-disable-next-line no-await-in-loop
			await new Promise(resolve => {
				setTimeout(resolve, 10);
			});
			continue;
		}

		// 3. Check Screen Content
		let screenMatch = true;

		for (let i = 0; i < worker.rows; i++) {
			// Worker screen might be sparse if not fully filled?
			// TerminalWriter fills `screen` array up to `rows`.
			const expectedLine = getPlainText(expected.screen[i]);
			const xtermLine =
				buffer
					.getLine(buffer.baseY + i)
					?.translateToString(true)
					.trimEnd() ?? '';

			if (expectedLine !== xtermLine) {
				screenMatch = false;
				break;
			}
		}

		if (screenMatch) {
			return;
		}

		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 10);
		});
	}

	const expected = worker.getExpectedState();
	const buffer = term.buffer.active;

	let diff = '';
	if (
		buffer.cursorX !== expected.cursorX ||
		buffer.cursorY !== expected.cursorY
	) {
		diff += `Cursor mismatch: xterm(${buffer.cursorX}, ${buffer.cursorY}) vs expected(${expected.cursorX}, ${expected.cursorY})\n`;
	}

	if (buffer.type !== 'alternate') {
		const workerBackbufferLen = expected.backbuffer.length;
		for (let i = 0; i < workerBackbufferLen; i++) {
			const expectedLine = getPlainText(expected.backbuffer[i]);
			const xtermLine =
				buffer.getLine(i)?.translateToString(true).trimEnd() ?? '';
			if (expectedLine !== xtermLine) {
				diff += `Backbuffer line ${i} mismatch:\n  xterm:    '${xtermLine}'\n  expected: '${expectedLine}'\n`;
				break;
			}
		}
	}

	for (let i = 0; i < worker.rows; i++) {
		const expectedLine = getPlainText(expected.screen[i]);
		const xtermLine =
			buffer
				.getLine(buffer.baseY + i)
				?.translateToString(true)
				.trimEnd() ?? '';
		if (expectedLine !== xtermLine) {
			diff += `Screen line ${i} mismatch:\n  xterm:    '${xtermLine}'\n  expected: '${expectedLine}'\n`;
			break;
		}
	}

	throw new Error(
		`Timeout waiting for terminal state to match worker state after ${timeout}ms\nDifferences:\n${diff}`,
	);
}

export async function captureTerminalState(
	term: Terminal,
	output: string,
	options: {logDebugInfo?: boolean} = {},
): Promise<string> {
	await writeToTerm(term, output);
	const buffer = term.buffer.active;
	const totalLines = buffer.length;
	const viewportHeight = term.rows;

	// In xterm.js, viewportY is the index of the top line of the viewport in the buffer
	// if there is scrollback.
	const {viewportY} = buffer;

	const allLines: string[] = [];
	for (let i = 0; i < totalLines; i++) {
		allLines.push(buffer.getLine(i)?.translateToString(true) ?? '');
	}

	if (!options.logDebugInfo) {
		return allLines.join('\n');
	}

	const backbufferLines = allLines.slice(0, viewportY);
	const viewportLines = allLines.slice(viewportY, viewportY + viewportHeight);

	// If there are lines after the viewport (e.g. if we scrolled up), include them too?
	// The prompt asks to "log what is in the viewport separately".
	// And "backbuffer height does not include lines that are in the active viewport".

	let result = `<backbuffer height: ${backbufferLines.length}>\n${backbufferLines.join('\n')}`;
	result += `\n<active-viewport ${term.cols}x${viewportHeight}>\n${viewportLines.join('\n')}`;

	return result;
}

export const createStyledLine = (text: string): StyledLine => {
	const line = new StyledLine();
	for (const char of text) {
		line.pushChar(char, 0);
	}

	return line;
};
