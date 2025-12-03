import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import {type OutputTransformer} from './render-node-to-output.js';
import {
	toStyledCharacters,
	inkCharacterWidth,
	styledCharsWidth,
} from './measure-text.js';

type TermCursorFocusInfo = {
	x: number;
	y: number;
	text: string;
	originalText: string;
	terminalCursorPosition?: number;
};

/**
"Virtual" output class

Handles the positioning and saving of the output of each node in the tree. Also responsible for applying transformations to each character of the output.

Used to generate the final output of all nodes before writing it to actual output stream (e.g. stdout)
*/

type Options = {
	width: number;
	height: number;
};

type Operation = WriteOperation | ClipOperation | UnclipOperation;

type WriteOperation = {
	type: 'write';
	x: number;
	y: number;
	items: string | StyledChar[];
	transformers: OutputTransformer[];
	lineIndex?: number;
	preserveBackgroundColor?: boolean;
};

type ClipOperation = {
	type: 'clip';
	clip: Clip;
};

type Clip = {
	x1: number | undefined;
	x2: number | undefined;
	y1: number | undefined;
	y2: number | undefined;
};

type UnclipOperation = {
	type: 'unclip';
};

export default class Output {
	width: number;
	height: number;

	private readonly operations: Operation[] = [];
	private cursorFocusInfo: TermCursorFocusInfo | null = null;

	private readonly clips: Clip[] = [];

	constructor(options: Options) {
		const {width, height} = options;

		this.width = width;
		this.height = height;
	}

	getCurrentClip(): Clip | undefined {
		return this.clips.at(-1);
	}

	write(
		x: number,
		y: number,
		items: string | StyledChar[],
		options: {
			transformers: OutputTransformer[];
			lineIndex?: number;
			preserveBackgroundColor?: boolean;
			isTerminalCursorFocused?: boolean;
			terminalCursorPosition?: number;
			originalText?: string;
		},
	): void {
		const {transformers, lineIndex, preserveBackgroundColor, isTerminalCursorFocused, terminalCursorPosition, originalText} = options;

		// Track cursor target position for terminal cursor synchronization
		// This should be set even for empty text (e.g., empty input field with prefix in separate Text)
		if (isTerminalCursorFocused) {
			const text = typeof items === 'string' ? items : '';
			this.cursorFocusInfo = {
				x,
				y,
				text: text || '',
				// Use originalText for cursor calculation (before applyPaddingToText)
				originalText: originalText || text || '',
				terminalCursorPosition: terminalCursorPosition
			};
		}

		if (items.length === 0) {
			return;
		}

		this.operations.push({
			type: 'write',
			x,
			y,
			items,
			transformers,
			lineIndex,
			preserveBackgroundColor,
		});
	}

	clip(clip: Clip) {
		this.operations.push({
			type: 'clip',
			clip,
		});

		const previousClip = this.clips.at(-1);
		const nextClip = {...clip};

		if (previousClip) {
			nextClip.x1 =
				previousClip.x1 === undefined
					? nextClip.x1
					: nextClip.x1 === undefined
						? previousClip.x1
						: Math.max(previousClip.x1, nextClip.x1);

			nextClip.x2 =
				previousClip.x2 === undefined
					? nextClip.x2
					: nextClip.x2 === undefined
						? previousClip.x2
						: Math.min(previousClip.x2, nextClip.x2);

			nextClip.y1 =
				previousClip.y1 === undefined
					? nextClip.y1
					: nextClip.y1 === undefined
						? previousClip.y1
						: Math.max(previousClip.y1, nextClip.y1);

			nextClip.y2 =
				previousClip.y2 === undefined
					? nextClip.y2
					: nextClip.y2 === undefined
						? previousClip.y2
						: Math.min(previousClip.y2, nextClip.y2);
		}

		this.clips.push(nextClip);
	}

	unclip() {
		this.operations.push({
			type: 'unclip',
		});

		this.clips.pop();
	}

	get(): {output: string; height: number; styledOutput: StyledChar[][]; cursorPosition?: {row: number; col: number} | null} {
		// Initialize output array with a specific set of rows, so that margin/padding at the bottom is preserved
		const output: StyledChar[][] = [];

		for (let y = 0; y < this.height; y++) {
			const row: StyledChar[] = [];

			for (let x = 0; x < this.width; x++) {
				row.push({
					type: 'char',
					value: ' ',
					fullWidth: false,
					styles: [],
				});
			}

			output.push(row);
		}

		const clips: Clip[] = [];

		for (const operation of this.operations) {
			if (operation.type === 'clip') {
				const previousClip = clips.at(-1);
				const nextClip = {...operation.clip};

				if (previousClip) {
					nextClip.x1 =
						previousClip.x1 === undefined
							? nextClip.x1
							: nextClip.x1 === undefined
								? previousClip.x1
								: Math.max(previousClip.x1, nextClip.x1);

					nextClip.x2 =
						previousClip.x2 === undefined
							? nextClip.x2
							: nextClip.x2 === undefined
								? previousClip.x2
								: Math.min(previousClip.x2, nextClip.x2);

					nextClip.y1 =
						previousClip.y1 === undefined
							? nextClip.y1
							: nextClip.y1 === undefined
								? previousClip.y1
								: Math.max(previousClip.y1, nextClip.y1);

					nextClip.y2 =
						previousClip.y2 === undefined
							? nextClip.y2
							: nextClip.y2 === undefined
								? previousClip.y2
								: Math.min(previousClip.y2, nextClip.y2);
				}

				clips.push(nextClip);
				continue;
			}

			if (operation.type === 'unclip') {
				clips.pop();
				continue;
			}

			if (operation.type === 'write') {
				this.applyWriteOperation(output, clips, operation);
			}
		}

		// Calculate cursor position from cursor target (if exists)
		let cursorPosition: {row: number; col: number} | null = null;
		if (this.cursorFocusInfo) {
			const {x, y, text, originalText, terminalCursorPosition: charIndex} = this.cursorFocusInfo;

			if (charIndex !== undefined) {
				// Use character index to calculate cursor position
				// Use originalText (before applyPaddingToText) for correct index calculation
				const clampedIndex = Math.min(charIndex, originalText.length);
				const textBeforeCursor = originalText.slice(0, clampedIndex);
				const lines = textBeforeCursor.split('\n');
				const lineIndex = lines.length - 1;
				const currentLine = lines[lineIndex] || '';

				const cursorRow = y + lineIndex;
				// For multi-line text, all lines start at x position (due to indentString in applyPaddingToText)
				const expectedCol = x + stringWidth(currentLine);

				cursorPosition = {
					row: cursorRow,
					col: expectedCol,
				};
			} else {
				// Use text end (backward compatible)
				const textLines = text.split('\n');
				const lastLineIndex = textLines.length - 1;
				const lastLine = textLines[lastLineIndex] || '';

				const cursorRow = y + lastLineIndex;
				const expectedCol = lastLineIndex === 0
					? x + stringWidth(lastLine)
					: stringWidth(lastLine);

				cursorPosition = {
					row: cursorRow,
					col: expectedCol,
				};
			}
		}

		const generatedOutput = output
			.map(line => {
				// See https://github.com/vadimdemedes/ink/pull/564#issuecomment-1637022742
				const lineWithoutEmptyItems = line.filter(item => item !== undefined);

				return styledCharsToString(lineWithoutEmptyItems).trimEnd();
			})
			.join('\n');

		// Adjust cursor position based on actual output (after trimEnd)
		if (cursorPosition) {
			const lines = generatedOutput.split('\n');
			const cursorLine = lines[cursorPosition.row];
			if (cursorLine !== undefined) {
				const actualLineWidth = stringWidth(cursorLine);
				// Cursor should not go beyond the actual trimmed line width
				cursorPosition.col = Math.min(cursorPosition.col, actualLineWidth);
			}
		}

		return {
			output: generatedOutput,
			height: output.length,
			styledOutput: output,
			cursorPosition,
		};
	}

	private clearRange(
		currentLine: StyledChar[],
		range: {start: number; end: number},
		styles: StyledChar['styles'],
		value = ' ',
	) {
		for (let offset = range.start; offset < range.end; offset++) {
			if (offset >= 0 && offset < this.width) {
				currentLine[offset] = {
					type: 'char',
					value,
					fullWidth: false,
					styles,
				};
			}
		}
	}

	private applyWriteOperation(
		output: StyledChar[][],
		clips: Clip[],
		operation: WriteOperation,
	) {
		const {transformers, lineIndex = 0} = operation;
		let {x, y, items} = operation;

		let chars: StyledChar[] =
			typeof items === 'string' ? toStyledCharacters(items) : items;

		const clip = clips.at(-1);
		let fromX: number | undefined;
		let toX: number | undefined;

		if (clip) {
			const clipResult = this.clipChars(chars, x, y, clip);

			if (!clipResult) {
				return;
			}

			chars = clipResult.chars;
			x = clipResult.x;
			y = clipResult.y;
			fromX = clipResult.fromX;
			toX = clipResult.toX;
		}

		const currentLine = output[y];

		// Line can be missing if `text` is taller than height of pre-initialized `this.output`
		if (!currentLine) {
			return;
		}

		if (transformers.length > 0) {
			let line = styledCharsToString(chars);
			for (const transformer of transformers) {
				line = transformer(line, lineIndex);
			}

			chars = toStyledCharacters(line);
		}

		let offsetX = x;
		let relativeX = 0;

		for (const character of chars) {
			const characterWidth = inkCharacterWidth(character.value);

			if (toX !== undefined && relativeX >= toX) {
				break;
			}

			if (fromX === undefined || relativeX >= fromX) {
				if (offsetX >= this.width) {
					break;
				}

				currentLine[offsetX] = character;

				if (characterWidth > 1) {
					this.clearRange(
						currentLine,
						{start: offsetX + 1, end: offsetX + characterWidth},
						character.styles,
						'',
					);
				}

				offsetX += characterWidth;
			} else if (
				characterWidth > 1 &&
				fromX !== undefined &&
				relativeX < fromX &&
				relativeX + characterWidth > fromX
			) {
				const clearLength = relativeX + characterWidth - fromX;
				this.clearRange(
					currentLine,
					{start: offsetX, end: offsetX + clearLength},
					character.styles,
					' ',
				);

				offsetX += clearLength;
			}

			relativeX += characterWidth;
		}

		if (toX !== undefined) {
			const absoluteToX = x - (fromX ?? 0) + toX;

			this.clearRange(currentLine, {start: offsetX, end: absoluteToX}, [], ' ');
		}
	}

	private clipChars(
		chars: StyledChar[],
		x: number,
		y: number,
		clip: Clip,
	):
		| {
				chars: StyledChar[];
				x: number;
				y: number;
				fromX: number | undefined;
				toX: number | undefined;
		  }
		| undefined {
		const {x1, x2, y1, y2} = clip;
		const clipHorizontally = typeof x1 === 'number' && typeof x2 === 'number';
		const clipVertically = typeof y1 === 'number' && typeof y2 === 'number';

		if (clipHorizontally) {
			const width = styledCharsWidth(chars);

			if (x + width < clip.x1! || x > clip.x2!) {
				return undefined;
			}
		}

		if (clipVertically && (y < clip.y1! || y >= clip.y2!)) {
			return undefined;
		}

		let fromX: number | undefined;
		let toX: number | undefined;

		if (clipHorizontally) {
			fromX = x < clip.x1! ? clip.x1! - x : 0;
			const width = styledCharsWidth(chars);
			toX = x + width > clip.x2! ? clip.x2! - x : width;

			if (x < clip.x1!) {
				x = clip.x1!;
			}
		}

		return {chars, x, y, fromX, toX};
	}
}
