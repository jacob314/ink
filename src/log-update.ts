import {type Writable} from 'node:stream';
import process from 'node:process';
import ansiEscapes from 'ansi-escapes';
import cliCursor from 'cli-cursor';

const enterSynchronizedOutput = '\u001B[?2026h';
const exitSynchronizedOutput = '\u001B[?2026l';

export type LogUpdate = {
	clear: () => void;
	done: () => void;
	sync: (str: string) => void;
	(str: string): void;
};

const createStandard = (
	stream: Writable,
	{
		showCursor = false,
		alternateBuffer = false,
		alternateBufferAlreadyActive = false,
		getRows = () => 0,
	}: {
		showCursor?: boolean;
		alternateBuffer?: boolean;
		alternateBufferAlreadyActive?: boolean;
		getRows?: () => number;
	} = {},
): LogUpdate => {
	let previousLineCount = 0;
	let previousOutput = '';
	// Keep track of the actual previous output rendered to the alternate buffer
	// which may be truncated to the terminal height.
	let previousOutputAlternateBuffer = '';
	let hasHiddenCursor = false;

	if (alternateBuffer && !alternateBufferAlreadyActive) {
		stream.write(ansiEscapes.enterAlternativeScreen);
	}

	const render = (str: string) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide();
			hasHiddenCursor = true;
		}

		const output = str + '\n';

		if (alternateBuffer) {
			let alternateBufferOutput = output;
			const rows = getRows() ?? 0;
			if (rows > 0) {
				const lines = str.split('\n');
				const lineCount = lines.length;
				// Only write the last `rows` lines as the alternate buffer
				// will not scroll so all we accomplish by writing more
				// content is risking flicker and confusing the terminal about
				// the cursor position.
				if (lineCount > rows) {
					alternateBufferOutput = lines.slice(-rows).join('\n');
				}

				// Only write the last `rows` lines as the alternate buffer
				// will not scroll so all we accomplish by writing more
				// content is risking flicker and confusing the terminal about
				// the cursor position.
				if (lineCount > rows) {
					alternateBufferOutput = str.split('\n').slice(-rows).join('\n');
				}
			}

			// In alternate buffer mode we need to re-render based on whether content
			// visible within the clipped alternate output buffer has changed even
			// if the entire output string has not changed.
			if (alternateBufferOutput !== previousOutputAlternateBuffer) {
				// Unfortunately, eraseScreen does not work correctly in iTerm2 so we
				// have to use clearTerminal instead.
				const eraseOperation =
					process.env['TERM_PROGRAM'] === 'iTerm.app'
						? ansiEscapes.clearTerminal
						: ansiEscapes.eraseScreen;
				stream.write(
					enterSynchronizedOutput +
						ansiEscapes.cursorTo(0, 0) +
						eraseOperation +
						alternateBufferOutput +
						exitSynchronizedOutput,
				);
				previousOutputAlternateBuffer = alternateBufferOutput;
			}

			previousOutput = output;
			return;
		}

		if (output === previousOutput) {
			return;
		}

		previousOutput = output;
		stream.write(ansiEscapes.eraseLines(previousLineCount) + output);
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
		getRows = () => 0,
	}: {
		showCursor?: boolean;
		alternateBuffer?: boolean;
		getRows?: () => number;
	} = {},
): LogUpdate => {
	let previousLines: string[] = [];
	let previousOutput = '';
	let previousOutputAlternateBuffer = '';
	let previousRows = 0;
	let hasHiddenCursor = false;

	if (alternateBuffer) {
		stream.write(ansiEscapes.enterAlternativeScreen);
	}

	const render = (str: string) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide();
			hasHiddenCursor = true;
		}

		const output = str + '\n';

		if (alternateBuffer) {
			let alternateBufferOutput = output;
			const rows = getRows() ?? 0;
			if (rows > 0) {
				const lines = str.split('\n');
				const lineCount = lines.length;
				// Only write the last `rows` lines as the alternate buffer
				// will not scroll so all we accomplish by writing more
				// content is risking flicker and confusing the terminal about
				// the cursor position.
				if (lineCount > rows) {
					alternateBufferOutput = lines.slice(-rows).join('\n');
				}
			}

			// In alternate buffer mode we need to re-render based on whether content
			// visible within the clipped alternate output buffer has changed even
			// if the entire output string has not changed.
			if (alternateBufferOutput !== previousOutputAlternateBuffer) {
				const nextLines = alternateBufferOutput.split('\n');

				if (rows !== previousRows) {
					// Unfortunately, eraseScreen does not work correctly in iTerm2 so we
					// have to use clearTerminal instead.
					const eraseOperation =
						process.env['TERM_PROGRAM'] === 'iTerm.app'
							? ansiEscapes.clearTerminal
							: ansiEscapes.eraseScreen;
					stream.write(
						enterSynchronizedOutput +
							ansiEscapes.cursorTo(0, 0) +
							eraseOperation +
							alternateBufferOutput +
							exitSynchronizedOutput,
					);
					previousRows = rows;
				} else {
					const buffer: string[] = [];
					buffer.push(enterSynchronizedOutput);
					buffer.push(ansiEscapes.cursorTo(0, 0));

					for (let i = 0; i < nextLines.length; i++) {
						if (nextLines[i] !== previousLines[i]) {
							buffer.push(ansiEscapes.eraseLine + nextLines[i]);
						} else {
							buffer.push(ansiEscapes.cursorNextLine);
							continue;
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

					buffer.push(exitSynchronizedOutput);
					stream.write(buffer.join(''));
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
			stream.write(ansiEscapes.eraseLines(previousCount) + output);
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

			buffer.push(ansiEscapes.eraseLine + nextLines[i] + '\n');
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
		incremental = false,
		getRows,
	}: {
		showCursor?: boolean;
		alternateBuffer?: boolean;
		incremental?: boolean;
		getRows?: () => number;
	} = {},
): LogUpdate => {
	if (incremental) {
		return createIncremental(stream, {showCursor, alternateBuffer, getRows});
	}

	return createStandard(stream, {showCursor, alternateBuffer, getRows});
};

const logUpdate = {create};
export default logUpdate;
