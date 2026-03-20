import fs from 'node:fs';
import path from 'node:path';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {TerminalBufferWorker} from '../../src/worker/render-worker.js';
import {loadReplay} from '../../src/worker/replay.js';
import {type RenderLine} from '../../src/worker/terminal-writer.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal: XtermTerminal} = xtermHeadless;

function getPlainText(line: RenderLine | undefined): string {
	if (!line) {
		return '';
	}

	// RenderLine.text contains ANSI codes. We want plain text for comparison with xterm buffer.
	return line.styledChars
		.map((c: StyledChar) => c.value)
		.join('')
		.trimEnd();
}

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
	options: Readonly<Record<string, unknown>> = {},
) {
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows,
		columns,
	} as unknown as NodeJS.WriteStream;

	const worker = new TerminalBufferWorker(columns, rows, {
		stdout,
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

export const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

export const createStyledLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));
