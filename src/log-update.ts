import {type Writable} from 'node:stream';
import process from 'node:process';
import ansiEscapes from 'ansi-escapes';
import cliCursor from 'cli-cursor';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import colorize from './colorize.js';

// Debugging option to simulate flicker if for terminals that do not support enableSynchronizedOutput.
const enableSynchronizedOutput = true;

const enterSynchronizedOutput = '\u001B[?2026h';
const exitSynchronizedOutput = '\u001B[?2026l';

export type LogUpdate = {
	clear: () => void;
	done: () => void;
	sync: (str: string) => void;
	(str: string, styledOutput: StyledChar[][], debugRainbowColor?: string): void;
};

const createStandard = (
	stream: Writable,
	{
		showCursor = false,
		alternateBuffer = false,
		alternateBufferAlreadyActive = false,
		getRows = () => 0,
		getColumns = () => 0,
	}: {
		showCursor?: boolean;
		alternateBuffer?: boolean;
		alternateBufferAlreadyActive?: boolean;
		getRows?: () => number;
		getColumns?: () => number;
	} = {},
): LogUpdate => {
	let previousLineCount = 0;
	let previousOutput = '';
	// Keep track of the actual previous output rendered to the alternate buffer
	// which may be truncated to the terminal height.
	let previousOutputAlternateBuffer = '';
	let previousRows = 0;
	let previousColumns = 0;
	let hasHiddenCursor = false;

	if (alternateBuffer) {
		if (!alternateBufferAlreadyActive) {
			stream.write(ansiEscapes.enterAlternativeScreen);
		}

		stream.write('\u001B[?7l');
	}

	const render = (
		str: string,
		_styledOutput: StyledChar[][],
		debugRainbowColor?: string,
	) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide();
			hasHiddenCursor = true;
		}

		const output = str + '\n';

		if (alternateBuffer) {
			let alternateBufferOutput = output;
			const rows = getRows() ?? 0;
			const columns = getColumns() ?? 0;

			if (rows > 0) {
				const lines = str.split('\n');
				const lineCount = lines.length;
				// Only write the first	`rows` lines as the alternate buffer
				// will not scroll so all we accomplish by writing more
				// content is risking flicker and confusing the terminal about
				// the cursor position.
				if (lineCount > rows) {
					alternateBufferOutput = lines.slice(0, rows).join('\n');
				}
			}

			// In alternate buffer mode we need to re-render based on whether content
			// visible within the clipped alternate output buffer has changed even
			// if the entire output string has not changed.
			if (
				alternateBufferOutput !== previousOutputAlternateBuffer ||
				rows !== previousRows ||
				columns !== previousColumns
			) {
				// Unfortunately, eraseScreen does not work correctly in iTerm2 so we
				// have to use clearTerminal instead.
				const eraseOperation =
					process.env['TERM_PROGRAM'] === 'iTerm.app'
						? ansiEscapes.clearTerminal
						: ansiEscapes.eraseScreen;

				let outputToWrite = alternateBufferOutput;
				outputToWrite = debugRainbowColor
					? colorize(outputToWrite, debugRainbowColor, 'background')
					: outputToWrite;

				stream.write(
					(enableSynchronizedOutput ? enterSynchronizedOutput : '') +
						ansiEscapes.cursorTo(0, 0) +
						eraseOperation +
						outputToWrite +
						(enableSynchronizedOutput ? exitSynchronizedOutput : ''),
				);
				previousOutputAlternateBuffer = alternateBufferOutput;
				previousRows = rows;
				previousColumns = columns;
			}

			previousOutput = output;
			return;
		}

		if (output === previousOutput) {
			return;
		}

		previousOutput = output;
		let outputToWrite = output;

		outputToWrite = debugRainbowColor
			? colorize(outputToWrite, debugRainbowColor, 'background')
			: outputToWrite;

		stream.write(ansiEscapes.eraseLines(previousLineCount) + outputToWrite);
		previousLineCount = output.split('\n').length;
	};

	render.clear = () => {
		if (alternateBuffer) {
			const eraseOperation =
				process.env['TERM_PROGRAM'] === 'iTerm.app'
					? ansiEscapes.clearTerminal
					: ansiEscapes.eraseScreen;
			stream.write(eraseOperation);
			previousOutput = '';
			return;
		}

		stream.write(ansiEscapes.eraseLines(previousLineCount));
		previousOutput = '';
		previousLineCount = 0;
	};

	render.done = () => {
		const lastFrame = previousOutput;
		previousOutput = '';
		previousLineCount = 0;

		if (!showCursor) {
			cliCursor.show();
			hasHiddenCursor = false;
		}

		if (alternateBuffer) {
			stream.write('\u001B[?7h');
			stream.write(ansiEscapes.exitAlternativeScreen);
			// The last frame was rendered to the alternate buffer.
			// We need to render it again to the main buffer. If apps do not
			// want this behavior, they can make sure the last frame is empty
			// before unmounting.
			stream.write(lastFrame);
		}
	};

	render.sync = (str: string) => {
		if (alternateBuffer) {
			previousOutput = str;
			return;
		}

		const output = str + '\n';
		previousOutput = output;
		previousLineCount = output.split('\n').length;
	};

	return render;
};

const createIncremental = (
	stream: Writable,
	{
		showCursor = false,
		alternateBuffer = false,
		alternateBufferAlreadyActive = false,
		getRows = () => 0,
		getColumns = () => 0,
	}: {
		showCursor?: boolean;
		alternateBuffer?: boolean;
		alternateBufferAlreadyActive?: boolean;
		getRows?: () => number;
		getColumns?: () => number;
	} = {},
): LogUpdate => {
	let previousLines: string[] = [];
	let previousOutput = '';
	let previousOutputAlternateBuffer = '';
	let previousRows = 0;
	let previousColumns = 0;
	let hasHiddenCursor = false;
	let alternateBufferStyledOutput: StyledChar[][] = [];

	if (alternateBuffer) {
		if (!alternateBufferAlreadyActive) {
			stream.write(ansiEscapes.enterAlternativeScreen);
		}

		stream.write('\u001B[?7l');
	}

	const render = (
		str: string,
		styledOutput: StyledChar[][],
		debugRainbowColor?: string,
	) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide();
			hasHiddenCursor = true;
		}

		const output = str + '\n';

		if (alternateBuffer) {
			let alternateBufferOutput = output;
			const rows = getRows() ?? 0;
			const columns = getColumns() ?? 0;

			if (rows > 0) {
				const lines = str.split('\n');
				const lineCount = lines.length;
				// Only write the first `rows` lines as the alternate buffer
				// will not scroll so all we accomplish by writing more
				// content is risking flicker and confusion about the terminal about
				// the cursor position.
				if (lineCount > rows) {
					alternateBufferOutput = lines.slice(0, rows).join('\n');
					alternateBufferStyledOutput = styledOutput.slice(0, rows);
				} else {
					alternateBufferOutput = lines.join('\n');
					alternateBufferStyledOutput = styledOutput;
				}
			}

			// In alternate buffer mode we need to re-render based on whether content
			// visible within the clipped alternate output buffer has changed even
			// if the entire output string has not changed.
			if (
				alternateBufferOutput !== previousOutputAlternateBuffer ||
				rows !== previousRows ||
				columns !== previousColumns
			) {
				const nextLines = alternateBufferOutput.split('\n');

				if (rows === previousRows && columns === previousColumns) {
					const buffer: string[] = [];
					if (enableSynchronizedOutput) {
						buffer.push(enterSynchronizedOutput);
					}

					buffer.push(ansiEscapes.cursorTo(0, 0));

					for (let i = 0; i < nextLines.length; i++) {
						if (nextLines[i] === previousLines[i]) {
							buffer.push(ansiEscapes.cursorNextLine);
							continue;
						}

						let lineToWrite = nextLines[i] ?? '';

						let lineLength = 0;
						const styledOutput = alternateBufferStyledOutput[i];

						if (styledOutput !== undefined) {
							for (let j = styledOutput.length - 1; j >= 0; j--) {
								const char = styledOutput[j];
								if (char === undefined) continue;
								if (char.value !== ' ' && char.value !== '') {
									lineLength = j + (char.fullWidth ? 2 : 1);
									break;
								}
							}
						}

						lineToWrite = debugRainbowColor
							? colorize(lineToWrite, debugRainbowColor, 'background')
							: lineToWrite;

						buffer.push(lineToWrite);
						if (columns > lineLength) {
							// Clear the rest of the line without introducing flicker.
							// We could optimize this further by only writing spaces up to the last line length
							// but this is safer.
							// The one failure mode for this is that if we add too many spaces and there was a
							// non space character at the very end of the line
							buffer.push(' '.repeat(columns - lineLength));
						}

						if (i < nextLines.length - 1) {
							buffer.push('\n');
						}
					}

					if (previousLines.length > nextLines.length) {
						const linesToClear = previousLines.length - nextLines.length;
						for (let i = 0; i < linesToClear; i++) {
							buffer.push(ansiEscapes.eraseLine + ansiEscapes.cursorNextLine);
						}
					}

					if (enableSynchronizedOutput) {
						buffer.push(exitSynchronizedOutput);
					}

					stream.write(buffer.join(''));
				} else {
					// Unfortunately, eraseScreen does not work correctly in iTerm2 so we
					// have to use clearTerminal instead.
					const eraseOperation =
						process.env['TERM_PROGRAM'] === 'iTerm.app'
							? ansiEscapes.clearTerminal
							: ansiEscapes.eraseScreen;

					let outputToWrite = alternateBufferOutput;

					outputToWrite = debugRainbowColor
						? colorize(outputToWrite, debugRainbowColor, 'background')
						: outputToWrite;

					stream.write(
						enterSynchronizedOutput +
							ansiEscapes.cursorTo(0, 0) +
							eraseOperation +
							outputToWrite +
							exitSynchronizedOutput,
					);
					previousRows = rows;
					previousColumns = columns;
				}

				previousOutputAlternateBuffer = alternateBufferOutput;
				previousLines = nextLines;
			}

			previousOutput = output;
			return;
		}

		if (output === previousOutput) {
			return;
		}

		const previousCount = previousLines.length;
		const nextLines = output.split('\n');
		const nextCount = nextLines.length;
		const visibleCount = nextCount - 1;

		if (output === '\n' || previousOutput.length === 0) {
			let outputToWrite = output;

			outputToWrite = debugRainbowColor
				? colorize(outputToWrite, debugRainbowColor, 'background')
				: outputToWrite;

			stream.write(ansiEscapes.eraseLines(previousCount) + outputToWrite);
			previousOutput = output;
			previousLines = nextLines;
			return;
		}

		// We aggregate all chunks for incremental rendering into a buffer, and then write them to stdout at the end.
		const buffer: string[] = [];

		// Clear extra lines if the current content's line count is lower than the previous.
		if (nextCount < previousCount) {
			buffer.push(
				// Erases the trailing lines and the final newline slot.
				ansiEscapes.eraseLines(previousCount - nextCount + 1),
				// Positions cursor to the top of the rendered output.
				ansiEscapes.cursorUp(visibleCount),
			);
		} else {
			buffer.push(ansiEscapes.cursorUp(previousCount - 1));
		}

		for (let i = 0; i < visibleCount; i++) {
			// We do not write lines if the contents are the same. This prevents flickering during renders.
			if (nextLines[i] === previousLines[i]) {
				buffer.push(ansiEscapes.cursorNextLine);
				continue;
			}

			let lineToWrite = nextLines[i] ?? '';

			lineToWrite = debugRainbowColor
				? colorize(lineToWrite, debugRainbowColor, 'background')
				: lineToWrite;

			buffer.push(ansiEscapes.eraseLine + lineToWrite + '\n');
		}

		stream.write(buffer.join(''));

		previousOutput = output;
		previousLines = nextLines;
	};

	render.clear = () => {
		if (alternateBuffer) {
			const eraseOperation =
				process.env['TERM_PROGRAM'] === 'iTerm.app'
					? ansiEscapes.clearTerminal
					: ansiEscapes.eraseScreen;
			stream.write(eraseOperation);
			previousOutput = '';
			return;
		}

		stream.write(ansiEscapes.eraseLines(previousLines.length));
		previousOutput = '';
		previousLines = [];
	};

	render.done = () => {
		const lastFrame = previousOutput;
		previousOutput = '';
		previousLines = [];

		if (!showCursor) {
			cliCursor.show();
			hasHiddenCursor = false;
		}

		if (alternateBuffer) {
			stream.write('\u001B[?7h');
			stream.write(ansiEscapes.exitAlternativeScreen);
			// The last frame was rendered to the alternate buffer.
			// We need to render it again to the main buffer. If apps do not
			// want this behavior, they can make sure the last frame is empty
			// before unmounting.
			stream.write(lastFrame);
		}
	};

	render.sync = (str: string) => {
		if (alternateBuffer) {
			previousOutput = str;
			return;
		}

		const output = str + '\n';
		previousOutput = output;
		previousLines = output.split('\n');
	};

	return render;
};

const create = (
	stream: Writable,
	{
		showCursor = false,
		alternateBuffer = false,
		alternateBufferAlreadyActive = false,
		incremental = false,
		getRows,
		getColumns,
	}: {
		showCursor?: boolean;
		alternateBuffer?: boolean;
		alternateBufferAlreadyActive?: boolean;
		incremental?: boolean;
		getRows?: () => number;
		getColumns?: () => number;
	} = {},
): LogUpdate => {
	if (incremental) {
		return createIncremental(stream, {
			showCursor,
			alternateBuffer,
			alternateBufferAlreadyActive,
			getRows,
			getColumns,
		});
	}

	return createStandard(stream, {
		showCursor,
		alternateBuffer,
		alternateBufferAlreadyActive,
		getRows,
		getColumns,
	});
};

const logUpdate = {create};
export default logUpdate;
