import process from 'node:process';
import ansiEscapes from 'ansi-escapes';
import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import {debugLog} from '../debug-log.js';
import colorize from '../colorize.js';

const enterSynchronizedOutput = '\u001B[?2026h';
const exitSynchronizedOutput = '\u001B[?2026l';

const synchronizeOutput = true;

export const rainbowColors = [
	'red',
	'green',
	'yellow',
	'blue',
	'magenta',
	'cyan',
	'white',
	'blackBright',
	'redBright',
	'greenBright',
	'yellowBright',
	'blueBright',
	'magentaBright',
	'cyanBright',
	'whiteBright',
];

export type RenderLine = {
	styledChars: StyledChar[];
	text: string;
	length: number;
	tainted: boolean;
};

const moveCursorDown = (skippedLines: number): string => {
	if (skippedLines > 0) {
		if (skippedLines === 1) {
			return ansiEscapes.cursorNextLine;
		}

		return ansiEscapes.cursorDown(skippedLines);
	}

	return '';
};

const moveCursorUp = (skippedLines: number): string => {
	if (skippedLines > 0) {
		if (skippedLines === 1) {
			return ansiEscapes.cursorPrevLine;
		}

		return ansiEscapes.cursorUp(skippedLines);
	}

	return '';
};

const deleteLines = (count: number): string => {
	return `\u001B[${count}M`;
};

const insertLines = (count: number): string => {
	return `\u001B[${count}L`;
};

const setScrollRegionCode = (top: number, bottom: number): string => {
	return `\u001B[${top};${bottom}r`;
};

const resetScrollRegion = '\u001B[r';

export function linesEqual(
	lineA: StyledChar[] | undefined,
	lineB: StyledChar[] | undefined,
): boolean {
	if (lineA === lineB) {
		return true;
	}

	if (!lineA || !lineB) {
		return false;
	}

	if (lineA.length !== lineB.length) {
		return false;
	}

	for (const [i, charA] of lineA.entries()) {
		const charB = lineB[i];

		if (charA.value !== charB!.value || charA.fullWidth !== charB!.fullWidth) {
			return false;
		}

		if (charA.styles.length !== charB!.styles.length) {
			return false;
		}

		for (const [j, styleA] of charA.styles.entries()) {
			const styleB = charB!.styles[j];

			if (styleA.code !== styleB!.code || styleA.endCode !== styleB!.endCode) {
				return false;
			}
		}
	}

	return true;
}

/**
 * This class is the core low level terminal renderer.
 *
 * It handles caching what content was previously rendered and operations
 * such as syncing individual lines without generating flicker and adding
 * lines to the backbuffer.
 */
export class TerminalWriter {
	public isTainted = false;
	public debugRainbowColor?: string;
	private linesUpdated = 0;
	private screen: RenderLine[] = [];
	private backbuffer: RenderLine[] = [];
	private cursorX = -1;
	private cursorY = -1;
	private targetCursorX = -1;
	private targetCursorY = -1;
	private scrollRegionTop = -1;
	private scrollRegionBottom = -1;
	private firstRender = true;
	private readonly enableSynchronizedOutput = synchronizeOutput;
	private cancelSlowFlush: (() => void) | undefined;

	private outputBuffer: string[] = [];
	private currentChunkBuffer: string[] = [];

	constructor(
		private columns: number,
		private rows: number,
		public readonly stdout: NodeJS.WriteStream,
	) {}

	getLinesUpdated(): number {
		return this.linesUpdated;
	}

	resetLinesUpdated() {
		this.linesUpdated = 0;
	}

	unkownCursorLocation() {
		this.cursorX = -1;
		this.cursorY = -1;
	}

	writeRaw(text: string) {
		this.writeHelper(text);
	}

	taintScreen() {
		for (const line of this.screen) {
			if (line) {
				line.tainted = true;
			}
		}
	}

	getBackbufferLength(): number {
		return this.backbuffer.length;
	}

	getBackbufferEntry(index: number): RenderLine | undefined {
		return this.backbuffer[index];
	}

	getScreenLine(y: number): RenderLine | undefined {
		return this.screen[y];
	}

	get isFirstRender(): boolean {
		return this.firstRender;
	}

	appendLinesBackbuffer(lines: RenderLine[]) {
		this.startSynchronizedOutput();
		try {
			// Ensure we have enough lines in screen to match rows
			const screenLines = [...this.screen];
			while (screenLines.length < this.rows) {
				screenLines.push({
					styledChars: [],
					text: '',
					length: 0,
					tainted: false,
				});
			}

			// The terminal lacks an API to scroll lines to the back buffer without first adding them to the main buffer.
			// Therefore, we simulate this by performing a scroll up of the top line(s) of the terminal,
			// then re-adding the visible lines to the terminal.
			this.performScroll({
				start: 0,
				end: this.rows,
				linesToScroll: lines.length,
				// We add the lines that are currently on screen at the very
				// end to avoid corrupting the content currently on screen.
				lines: [...lines, ...screenLines.slice(0, this.rows)],
				direction: 'up',
				scrollToBackbuffer: true,
			});
		} finally {
			this.endSynchronizedOutput();
		}
	}

	updateBackbuffer(start: number, deleteCount: number, newLines: RenderLine[]) {
		const backbufferLength = this.backbuffer.length;
		const screenStart = Math.max(0, backbufferLength - this.rows);

		// Case 1: Append at the very end
		if (start === backbufferLength && deleteCount === 0) {
			this.appendLinesBackbuffer(newLines);
			return;
		}

		// Case 2: Within the screen
		if (start >= screenStart) {
			this.backbuffer.splice(start, deleteCount, ...newLines);
			return;
		}

		// Case 3: Other cases (outside screen, not append)
		this.isTainted = true;
	}

	syncLines(lines: RenderLine[]) {
		const backBufferLength = Math.max(0, lines.length - this.rows);

		for (const [i, line] of lines.entries()) {
			if (i < backBufferLength) {
				const clampedLine = this.clampLine(line.styledChars, this.columns);
				this.backbuffer.push(clampedLine);
			} else {
				const screenRow = i - backBufferLength;
				this.syncLine(line, screenRow);
			}
		}

		this.firstRender = false;
	}

	writeLines(lines: RenderLine[]) {
		if (this.backbuffer.length > 0 || this.screen.length > 0) {
			throw new Error(
				`writeLines can only be called on an empty terminal. Sizes = ${this.backbuffer.length}, ${this.screen.length}`,
			);
		}

		const backBufferLength = Math.max(0, lines.length - this.rows);

		for (const [i, line] of lines.entries()) {
			const clampedLine = this.clampLine(line.styledChars, this.columns);
			let textToWrite = clampedLine.text;

			if (this.debugRainbowColor) {
				textToWrite = colorize(
					textToWrite,
					this.debugRainbowColor,
					'background',
				);
			}

			this.writeHelper(textToWrite);
			this.linesUpdated++;

			if (
				i >= backBufferLength &&
				i < backBufferLength + this.rows &&
				this.isFirstRender
			) {
				// Need to clear any text we might be rendering on top of.
				this.writeHelper(ansiEscapes.eraseEndLine);
			}

			if (i + 1 < lines.length) {
				this.writeHelper('\n');
			}

			if (i < backBufferLength) {
				this.backbuffer.push(clampedLine);
			} else {
				this.screen.push(clampedLine);
			}
		}

		if (this.isFirstRender) {
			/// Clean up lines at the bottom of the screen if we
			// rendered at less than the terminal height.
			for (let row = lines.length; row < this.rows; row++) {
				this.writeHelper('\n' + ansiEscapes.eraseEndLine);
			}
		}

		this.cursorX = -1;
		this.cursorY = -1;

		this.firstRender = false;

		this.finishChunkAndUpdateCursor();
	}

	setTargetCursorPosition(row: number, col: number) {
		if (this.targetCursorY === row && this.targetCursorX === col) {
			return;
		}

		this.targetCursorY = row;
		this.targetCursorX = col;
	}

	finish() {
		this.finishChunkAndUpdateCursor();
		this.targetCursorY = -1;
		this.targetCursorX = -1;
	}

	done() {
		this.finishChunkAndUpdateCursor();

		if (this.screen.length > 0) {
			const lastRow = this.screen.length - 1;
			const lastLine = this.screen[lastRow];
			if (lastLine) {
				this.moveCursor(lastRow, lastLine.length);
				this.writeHelper('\n');
				this.cursorX = 0;
				this.cursorY = lastRow + 1;
			}
		}

		this.finishChunkAndUpdateCursor();
	}

	moveCursor(x: number, y: number) {
		if (x === this.cursorY && y === this.cursorX) {
			return;
		}

		const diff = x - this.cursorY;

		if (
			this.cursorY < 0 ||
			this.cursorX < 0 ||
			x !== this.cursorY ||
			y !== this.cursorX
		) {
			this.writeHelper(ansiEscapes.cursorTo(y, x));
			this.cursorY = x;
			this.cursorX = y;
			return;
		}

		if (diff > 0) {
			this.writeHelper(moveCursorDown(diff));
		} else if (diff < 0) {
			this.writeHelper(moveCursorUp(-diff));
		}

		this.cursorY = x;

		if (y !== this.cursorX) {
			if (y === 0) {
				this.writeHelper(ansiEscapes.cursorLeft);
			} else {
				this.writeHelper(ansiEscapes.cursorTo(y));
			}

			this.cursorX = y;
		}
	}

	clampLine(line: StyledChar[], width: number): RenderLine {
		if (width <= 0) {
			return {
				styledChars: [],
				text: '',
				length: 0,
				tainted: false,
			};
		}

		let i = line.length - 1;

		while (i >= 0 && line[i]?.value === ' ' && line[i]!.styles.length === 0) {
			i--;
		}

		const trimmedLength = i + 1;

		let visualWidth = 0;

		for (let k = 0; k < trimmedLength; k++) {
			if (line[k]?.value === '') {
				continue;
			}

			visualWidth += line[k]!.fullWidth ? 2 : 1;
		}

		if (visualWidth <= width) {
			const styledChars = line.slice(0, trimmedLength);
			return {
				styledChars,
				text: styledCharsToString(styledChars),
				length: visualWidth,
				tainted: false,
			};
		}

		// Truncate logic
		const lastNonSpaceChar = line[i];
		const hasBoxChar =
			lastNonSpaceChar &&
			(lastNonSpaceChar.value === '╮' ||
				lastNonSpaceChar.value === '│' ||
				lastNonSpaceChar.value === '╯');

		let targetVisualWidth = width;

		if (hasBoxChar && lastNonSpaceChar) {
			targetVisualWidth -= lastNonSpaceChar.fullWidth ? 2 : 1;
		}

		let currentWidth = 0;
		let sliceIndex = 0;

		for (let k = 0; k < trimmedLength; k++) {
			const charWidth = line[k]!.fullWidth ? 2 : 1;

			if (currentWidth + charWidth > targetVisualWidth) {
				break;
			}

			currentWidth += charWidth;
			sliceIndex++;
		}

		if (hasBoxChar && lastNonSpaceChar) {
			const boxWidth = lastNonSpaceChar.fullWidth ? 2 : 1;
			const styledChars = [...line.slice(0, sliceIndex), lastNonSpaceChar];

			return {
				styledChars,
				text: styledCharsToString(styledChars),
				length: currentWidth + boxWidth,
				tainted: false,
			};
		}

		const styledChars = line.slice(0, sliceIndex);
		return {
			styledChars,
			text: styledCharsToString(styledChars),
			length: currentWidth,
			tainted: false,
		};
	}

	syncLine(line: RenderLine, y: number) {
		if (y < 0 || y >= this.rows) {
			return;
		}

		const clampedLine = this.clampLine(line.styledChars, this.columns);
		const currentLine = this.screen[y];

		if (
			currentLine &&
			!currentLine.tainted &&
			currentLine.text === clampedLine.text
		) {
			// Content matches, no update needed
			return;
		}

		this.moveCursor(y, 0);
		this.linesUpdated++;

		let textToWrite = clampedLine.text;
		if (this.debugRainbowColor) {
			textToWrite = colorize(textToWrite, this.debugRainbowColor, 'background');
		}

		this.writeHelper(textToWrite);

		if (clampedLine.length < this.columns) {
			this.writeHelper(ansiEscapes.eraseEndLine);
		}

		if (y !== this.rows - 1 && y !== this.scrollRegionBottom - 1) {
			this.writeHelper('\n');
			this.cursorY = y + 1;
			this.cursorX = -1;
		} else {
			this.cursorY = y;
			this.cursorX = clampedLine.length;
		}

		clampedLine.tainted = false;
		this.screen[y] = clampedLine;
	}

	scrollLines(options: {
		start: number;
		end: number;
		linesToScroll: number;
		lines: RenderLine[];
		direction: 'up' | 'down';
		scrollToBackbuffer: boolean;
	}) {
		try {
			this.performScroll(options);
		} finally {
			this.resetScrollRegion();
		}
	}

	resize(columns: number, rows: number) {
		if (this.columns === columns && this.rows === rows) {
			return;
		}

		this.columns = columns;
		this.rows = rows;

		const startIndex = Math.max(0, this.backbuffer.length - this.rows);

		for (let i = startIndex; i < this.backbuffer.length; i++) {
			const line = this.backbuffer[i];

			if (line && line.length >= this.columns) {
				line.tainted = true;
			}
		}

		for (const line of this.screen) {
			if (line) {
				line.tainted = true;
			}
		}
	}

	clear() {
		const eraseOperation =
			process.env['TERM_PROGRAM'] === 'iTerm.app'
				? ansiEscapes.clearTerminal
				: ansiEscapes.eraseScreen;

		this.writeHelper(eraseOperation);
		// Tmux does not reset the scroll region reliably on clear so we
		// reset it manually.
		this.writeHelper(resetScrollRegion);
		this.scrollRegionTop = -1;
		this.scrollRegionBottom = -1;
		this.screen = [];
		this.backbuffer = [];
		this.firstRender = true;
		// Set the cursor to an unknown location as tmux
		// Does not appear to always reset it to 0,0 on clear
		// While in mouse mode.
		this.cursorX = -1;
		this.cursorY = -1;
	}

	startSynchronizedOutput() {
		this.writeHelper(enterSynchronizedOutput);
	}

	endSynchronizedOutput() {
		this.writeHelper(exitSynchronizedOutput);
		this.finishChunkAndUpdateCursor();
	}

	flush() {
		if (this.cancelSlowFlush) {
			this.cancelSlowFlush();
		}

		this.finishChunkAndUpdateCursor();

		if (this.outputBuffer.length > 0) {
			this.synchronizedWrite(this.outputBuffer.join(''));
		}

		this.firstRender = false;

		this.outputBuffer = [];
	}

	async slowFlush() {
		if (this.cancelSlowFlush) {
			this.cancelSlowFlush();
		}

		this.finishChunkAndUpdateCursor();

		if (this.outputBuffer.length === 0) {
			return;
		}

		this.firstRender = false;

		while (this.outputBuffer.length > 0) {
			const chunk = this.outputBuffer.shift();

			if (chunk) {
				this.synchronizedWrite(chunk);
			}

			// eslint-disable-next-line no-await-in-loop
			await new Promise<void>(resolve => {
				let finished = false;
				const timer = setTimeout(() => {
					finished = true;
					this.cancelSlowFlush = undefined;
					resolve();
				}, 30);

				this.cancelSlowFlush = () => {
					if (!finished) {
						clearTimeout(timer);
						finished = true;

						if (this.outputBuffer.length > 0) {
							this.synchronizedWrite(this.outputBuffer.join(''));
							this.outputBuffer = [];
						}

						this.cancelSlowFlush = undefined;
						resolve();
					}
				};
			});
		}
	}

	validateLinesConsistent(lines: RenderLine[]) {
		if (this.isTainted) {
			return;
		}

		for (let r = 0; r < this.rows; r++) {
			const index = lines.length + r - this.rows;

			if (index < 0) {
				continue;
			}

			if (!linesEqual(this.screen[r]?.styledChars, lines[index]?.styledChars)) {
				debugLog(
					`Line ${r} on screen inconsistent between terminalWriter and ground truth. Expected "${styledCharsToString(
						lines[index]?.styledChars ?? [],
					)}", got "${styledCharsToString(this.screen[r]?.styledChars ?? [])}"`,
				);
			}
		}

		// Validated the backbuffer matches for lines 0 -> this.lines.length - this.rows
		const backbufferLimit = lines.length - this.rows;

		for (let i = 0; i < backbufferLimit; i++) {
			if (!linesEqual(this.backbuffer[i]?.styledChars, lines[i]?.styledChars)) {
				debugLog(
					`Line ${i} in backbuffer inconsistent. Expected "${styledCharsToString(
						lines[i]?.styledChars ?? [],
					)}", got "${styledCharsToString(this.backbuffer[i]?.styledChars ?? [])}"`,
				);
			}
		}
	}

	/**
	 * Trigger a scroll up of content into the backbuffer.
	 */
	private applyScrollUpBackbuffer(start: number, bottom: number) {
		// Simulate the effect of adding a linebreak at the bottom of the scroll region.

		this.moveCursor(bottom - 1, 0);
		this.writeHelper('\n');
		this.cursorX = -1;
		this.cursorY = bottom - 1;

		if (start === 0) {
			this.backbuffer.push(this.screen[0]!);
		}

		for (let i = start; i < bottom - 1; i++) {
			this.screen[i] = this.screen[i + 1]!;
		}

		this.screen[bottom - 1] = {
			styledChars: [],
			text: '',
			length: 0,
			tainted: false,
		};
	}

	private applyScrollUp(start: number, bottom: number) {
		this.moveCursor(start, 0);
		this.writeHelper(deleteLines(1));
		// Simulate the effect of the ansi escape for scroll up
		for (let i = start; i < bottom - 1; i++) {
			this.screen[i] = this.screen[i + 1]!;
		}

		this.screen[bottom - 1] = {
			styledChars: [],
			text: '',
			length: 0,
			tainted: false,
		};
	}

	private applyScrollDown(start: number, bottom: number) {
		this.moveCursor(start, 0);
		this.writeHelper(insertLines(1));
		// Simulate the effect of the ansi escape for scroll up
		for (let i = bottom - 1; i > start; i--) {
			this.screen[i] = this.screen[i - 1]!;
		}

		this.screen[start] = {styledChars: [], text: '', length: 0, tainted: false};
	}

	private performScroll(options: {
		start: number;
		end: number;
		linesToScroll: number;
		lines: RenderLine[];
		direction: 'up' | 'down';
		scrollToBackbuffer: boolean;
	}) {
		const {start, end, linesToScroll, lines, direction, scrollToBackbuffer} =
			options;
		debugLog(
			`[terminal-writer] SCROLLING LINES ${start}-${end} by ${linesToScroll} ${direction}`,
		);
		this.setScrollRegion(start, end);
		const scrollAreaHeight = end - start;

		if (lines.length !== end - start + linesToScroll) {
			throw new Error(
				`Mismatch in scrollLines: expected ${
					end - start + linesToScroll
				} lines, got ${lines.length}`,
			);
		}

		if (scrollToBackbuffer && direction !== 'up') {
			throw new Error(
				`scrollToBackbuffer is only supported for direction "up"`,
			);
		}

		if (scrollToBackbuffer && start > 0) {
			throw new Error(
				`scrollToBackbuffer is only supported for start=0, got ${start}`,
			);
		}

		// Make sure the content on screen before scrolling really matches what is in lines.
		// For 'up', existing content is at the start of 'lines'.
		// For 'down', existing content is at the end of 'lines'.
		const existingContentOffset = direction === 'up' ? 0 : linesToScroll;
		for (let i = start; i < end; i++) {
			this.syncLine(lines[existingContentOffset + i - start]!, i);
		}

		if (direction === 'up') {
			for (let i = 0; i < linesToScroll; i++) {
				if (scrollToBackbuffer) {
					this.applyScrollUpBackbuffer(start, end);
				} else {
					this.applyScrollUp(start, end);
				}
				// Add the new line at the end after scrolling up the other lines

				this.unkownCursorLocation();
				this.syncLine(lines[i + scrollAreaHeight]!, end - 1);
			}

			this.finishChunkAndUpdateCursor();
		} else if (direction === 'down') {
			for (let i = 0; i < linesToScroll; i++) {
				const line = lines[linesToScroll - 1 - i]!;
				this.applyScrollDown(start, end);
				// Add the new line at the end after scrolling up the other lines
				this.unkownCursorLocation();
				this.syncLine(line, start);
			}

			this.finishChunkAndUpdateCursor();
		}
	}

	private synchronizedWrite(text: string) {
		if (this.enableSynchronizedOutput) {
			this.stdout.write(
				enterSynchronizedOutput + text + exitSynchronizedOutput,
			);
		} else {
			this.stdout.write(text);
		}
	}

	private resetScrollRegion() {
		if (this.scrollRegionTop !== -1 || this.scrollRegionBottom !== -1) {
			this.writeHelper(resetScrollRegion);
			this.scrollRegionTop = -1;
			this.scrollRegionBottom = -1;
		}
	}

	private setScrollRegion(top: number, bottom: number) {
		if (this.scrollRegionTop !== top || this.scrollRegionBottom !== bottom) {
			this.writeHelper(setScrollRegionCode(top + 1, bottom));
			this.scrollRegionTop = top;
			this.scrollRegionBottom = bottom;
		}
	}

	private writeHelper(text: string) {
		this.currentChunkBuffer.push(text);
	}

	private finishChunkAndUpdateCursor() {
		if (this.targetCursorY >= 0 && this.targetCursorX >= 0) {
			this.moveCursor(this.targetCursorY, this.targetCursorX);
		}

		if (this.currentChunkBuffer.length > 0) {
			this.outputBuffer.push(this.currentChunkBuffer.join(''));
			this.currentChunkBuffer = [];
		}
	}
}
