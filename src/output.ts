import sliceAnsi from 'slice-ansi';
import {
	type StyledChar,
	styledCharsFromTokens,
	styledCharsToString,
	tokenize,
} from '@alcalzone/ansi-tokenize';
import {type OutputTransformer} from './render-node-to-output.js';
import measureText, {inkCharacterWidth, inkStringWidth} from './measure-text.js';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const DEBUG_LOG = false;

const logFile = path.join(os.homedir(), 'log.txt');

/**
 * "Virtual" output class
 *
 * Handles the positioning and saving of the output of each node in the tree.
 * Also responsible for applying transformations to each character of the output.
 *
 * Used to generate the final output of all nodes before writing it to actual
 * output stream (e.g. stdout)
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
	text: string;
	transformers: OutputTransformer[];
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

	constructor(options: Options) {
		const {width, height} = options;

		this.width = width;
		this.height = height;
	}

	write(
		x: number,
		y: number,
		text: string,
		options: {
			transformers: OutputTransformer[];
			preserveBackgroundColor?: boolean;
		},
	): void {
		const {transformers, preserveBackgroundColor} = options;

		if (!text) {
			return;
		}

		this.operations.push({
			type: 'write',
			x,
			y,
			text,
			transformers,
			preserveBackgroundColor,
		});
	}

	clip(clip: Clip) {
		this.operations.push({
			type: 'clip',
			clip,
		});
	}

	unclip() {
		this.operations.push({
			type: 'unclip',
		});
	}

	get(): {output: string; height: number} {
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

		const generatedOutput = output
			.map(line => {
				// See https://github.com/vadimdemedes/ink/pull/564#issuecomment-1637022742
				const lineWithoutEmptyItems = line.filter(item => item !== undefined);

				return styledCharsToString(lineWithoutEmptyItems).trimEnd();
			})
			.join('\n');

		return {
			output: generatedOutput,
			height: output.length,
		};
	}

	private applyWriteOperation(
		output: StyledChar[][],
		clips: Clip[],
		operation: WriteOperation,
	) {
		const {text, transformers} = operation;
		let {x, y} = operation;
		let lines = text.split('\n');
		const clip = clips.at(-1);

		if (clip) {
			const clipResult = this.clipText(lines, x, y, clip);

			if (!clipResult) {
				return;
			}

			lines = clipResult.lines;
			x = clipResult.x;
			y = clipResult.y;
		}

		let offsetY = 0;

		for (const [index, initialLine] of lines.entries()) {
			let line = initialLine;
			const currentLine = output[y + offsetY];

			// Line can be missing if `text` is taller than height of pre-initialized `this.output`
			if (!currentLine) {
				continue;
			}

			for (const transformer of transformers) {
				line = transformer(line, index);
			}

			const characters = styledCharsFromTokens(tokenize(line));
			const combinedCharacters: StyledChar[] = [];

			if (DEBUG_LOG) {
				const charactersForLog = characters.map(character => {
					if (character.type !== 'char') {
						return character;
					}

					const value = character.value;
					const codePoints = Array.from(value).map(char =>
						char.codePointAt(0)?.toString(16).toUpperCase(),
					);

					return {
						...character,
						codePoints,
						length: codePoints.length,
					};
				});

				fs.appendFileSync(
					logFile,
					`[output.ts] rendering  "${line}": ${JSON.stringify(
						charactersForLog,
						null,
						2,
					)}\n`,
				);
			}

			for (let i = 0; i < characters.length; i++) {
				const character = characters[i];

				if (character === undefined) {
					continue;
				}
				if (character.value == '\t') {
					character.value = '    ';
				}

				// Look ahead for combining characters.
				// See: https://en.wikipedia.org/wiki/Combining_character
				while (i + 1 < characters.length) {
					const nextCharacter = characters[i + 1];
					if (nextCharacter === undefined) { break; }

					let codePoints =  Array.from(nextCharacter.value).map(char =>char.codePointAt(0));
					// Variation selectors
					const isVariationSelector =
						nextCharacter.value.length === 1 &&
						codePoints[0]! >= 0xFE00 &&
						codePoints[0]! <= 0xFE0F;

					// Skin tone modifiers
					const isSkinToneModifier =
						codePoints.length === 2 &&
						codePoints[0] === 0xD83C &&
						codePoints[1]! >= 0xDFFB &&
						codePoints[1]! <= 0xDFFF;

					const isZeroWidthJoiner = codePoints.length === 1 && codePoints[0] === 0x200D;
					const isKeycap = codePoints.length === 1 && codePoints[0] === 0x20E3;

					// Tags block (U+E0000 - U+E007F)
					const isTagsBlock =
						codePoints[0]! >= 0xE0000 &&
						codePoints[0]! <= 0xE007F;

					const isCombining =
						isVariationSelector ||
						isSkinToneModifier ||
						isZeroWidthJoiner ||
						isKeycap ||
						isTagsBlock;

					if (
						isCombining
					) {
						if (DEBUG_LOG) {
							fs.appendFileSync(
								logFile,
								`[output.ts] XXX Combining "${nextCharacter.value}" (U+${codePoints
									.map(cp => cp!.toString(16).toUpperCase())
									.join(', U+')}) with preceding character "${character.value}"\n`,
							);
						}
						// Merge with previous character
						character.value += nextCharacter.value;
						i++; // Consume next character.

						// If it was a ZWJ, also consume the character after it.
						// TODO(jacobr): if there are dangling ZWJ chars we are in trouble. we probably need to add in an extra
						// empty character or something to ensure no bad things happen or perhaps strip the ZWJ completely.
						if (isZeroWidthJoiner && i + 1 < characters.length) {
							const characterAfterZwj = characters[i + 1];
							if (
								characterAfterZwj !== undefined
							) {
								character.value += characterAfterZwj.value;
								i++; // Consume character after ZWJ.
							}
						}
					} else {
						break;
					}
				}

				combinedCharacters.push(character);
			}

			let offsetX = x;

			for (const character of combinedCharacters) {
				if (operation.preserveBackgroundColor) {
					const existingCharacter = currentLine[offsetX];
					if (existingCharacter) {
											const existingBackgroundStyles = existingCharacter.styles.filter(
												style => style.endCode === '\u001b[49m',
											);
						character.styles.push(...existingBackgroundStyles);
					}
				}

				currentLine[offsetX] = character;

				// Determine printed width using string-width to align with measurement
				const characterWidth = Math.max(1, inkCharacterWidth(character.value));

				// For multi-column characters, clear following cells to avoid stray spaces/artifacts
				if (characterWidth > 1) {
					for (let index = 1; index < characterWidth; index++) {
						currentLine[offsetX + index] = {
							type: 'char',
							value: '',
							fullWidth: false,
							styles: character.styles,
						};
					}
				}

				offsetX += characterWidth;
			}

			offsetY++;
		}
	}

	private clipText(
		lines: string[],
		x: number,
		y: number,
		clip: Clip,
	): {lines: string[]; x: number; y: number} | undefined {
		const {x1, x2, y1, y2} = clip;
		const clipHorizontally = typeof x1 === 'number' && typeof x2 === 'number';
		const clipVertically = typeof y1 === 'number' && typeof y2 === 'number';

		if (clipHorizontally) {
			const width = measureText(lines.join('\n')).width;

			if (x + width < clip.x1! || x > clip.x2!) {
				return undefined;
			}
		}

		if (clipVertically) {
			const height = lines.length;

			if (y + height < clip.y1! || y > clip.y2!) {
				return undefined;
			}
		}

		if (clipHorizontally) {
			lines = lines.map(line => {
				const from = x < clip.x1! ? clip.x1! - x : 0;
				const width = inkStringWidth(line);
				const to = x + width > clip.x2! ? clip.x2! - x : width;

				return sliceAnsi(line, from, to);
			});

			if (x < clip.x1!) {
				x = clip.x1!;
			}
		}

		if (clipVertically) {
			const from = y < clip.y1! ? clip.y1! - y : 0;
			const height = lines.length;
			const to = y + height > clip.y2! ? clip.y2! - y : height;

			lines = lines.slice(from, to);

			if (y < clip.y1!) {
				y = clip.y1!;
			}
		}

		return {lines, x, y};
	}
}
