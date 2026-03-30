import stringWidth from 'string-width';
import {tokenize, styledLineFromTokens} from './tokenize.js';
import {StyledLine} from './styled-line.js';
import {DataLimitedLruMap} from './data-limited-lru-map.js';
import {type DOMNode} from './dom.js';

export type StringWidth = (text: string) => number;

/**
 * Character offset range within a text sequence.
 * Used for mapping DOM nodes to their character positions.
 */
export type CharOffsetRange = {start: number; end: number};

/**
 * Maps DOM nodes to their character offset ranges within squashed text.
 * This is the same character counting method used by getPositionAtOffset(),
 * ensuring consistent cursor position calculations across the codebase.
 */
export type CharOffsetMap = Map<DOMNode, CharOffsetRange>;

const defaultStringWidth: StringWidth = stringWidth;

let currentStringWidth: StringWidth = defaultStringWidth;

// This cache must be cleared each time the string width function is changed.
const widthCache = new Map<string, number>();

// This cache can persist for the lifetime of the application.
const toStyledCharactersCache = new DataLimitedLruMap<StyledLine>(
	2000,
	100_000,
);

let toStyledCharactersCacheEnabled = true;

export function setEnableToStyledCharactersCache(enabled: boolean) {
	toStyledCharactersCacheEnabled = enabled;
	if (!enabled) {
		toStyledCharactersCache.clear();
	}
}

export function setStringWidthFunction(fn: StringWidth) {
	currentStringWidth = fn;
	clearStringWidthCache();
}

export function clearStringWidthCache() {
	widthCache.clear();
}

export function clearToStyledCharactersCache() {
	toStyledCharactersCache.clear();
}

export function toStyledCharacters(text: string): StyledLine {
	if (toStyledCharactersCacheEnabled) {
		const cached = toStyledCharactersCache.get(text);
		if (cached !== undefined) {
			return cached;
		}
	}

	const tokens = tokenize(text);
	const characters = styledLineFromTokens(tokens);
	const combinedLine = new StyledLine();

	for (let i = 0; i < characters.length; i++) {
		const value = characters.getValue(i);
		const formatFlags = characters.getFormatFlags(i);
		const fgColor = characters.getFgColor(i);
		const bgColor = characters.getBgColor(i);
		const link = characters.getLink(i);

		if (value === '\t') {
			for (let j = 0; j < 4; j++) {
				combinedLine.pushChar(' ', formatFlags, fgColor, bgColor, link);
			}

			continue;
		}

		if (value === '\b') {
			continue;
		}

		let combinedValue = value;
		let isCombined = false;
		const firstCodePoint = combinedValue.codePointAt(0);

		// 1. Regional Indicators (Flags)
		if (
			firstCodePoint &&
			firstCodePoint >= 0x1_f1_e6 &&
			firstCodePoint <= 0x1_f1_ff &&
			i + 1 < characters.length
		) {
			const nextValue = characters.getValue(i + 1);
			const nextFirstCodePoint = nextValue.codePointAt(0);

			if (
				nextFirstCodePoint &&
				nextFirstCodePoint >= 0x1_f1_e6 &&
				nextFirstCodePoint <= 0x1_f1_ff
			) {
				combinedValue += nextValue;
				i++;
				isCombined = true;
			}
		}

		if (!isCombined) {
			// 2. Other combining characters
			while (i + 1 < characters.length) {
				const nextValue = characters.getValue(i + 1);
				if (!nextValue) break;

				const nextFirstCodePoint = nextValue.codePointAt(0);
				if (!nextFirstCodePoint) break;

				const isUnicodeMark = /\p{Mark}/u.test(nextValue);
				const isSkinToneModifier =
					nextFirstCodePoint >= 0x1_f3_fb && nextFirstCodePoint <= 0x1_f3_ff;
				const isZeroWidthJoiner = nextFirstCodePoint === 0x20_0d;
				const isTagsBlock =
					nextFirstCodePoint >= 0xe_00_00 && nextFirstCodePoint <= 0xe_00_7f;

				const isCombining =
					isUnicodeMark ||
					isSkinToneModifier ||
					isZeroWidthJoiner ||
					isTagsBlock;

				if (!isCombining) {
					break;
				}

				combinedValue += nextValue;
				i++;

				if (isZeroWidthJoiner && i + 1 < characters.length) {
					const characterAfterZwj = characters.getValue(i + 1);
					if (characterAfterZwj) {
						combinedValue += characterAfterZwj;
						i++;
					}
				}
			}
		}

		combinedLine.pushChar(combinedValue, formatFlags, fgColor, bgColor, link);
	}

	if (toStyledCharactersCacheEnabled) {
		toStyledCharactersCache.set(text, combinedLine);
	}

	return combinedLine;
}

export function styledCharsWidth(line: StyledLine): number {
	let length = 0;
	for (let i = 0; i < line.length; i++) {
		length += inkCharacterWidth(line.getValue(i));
	}

	return length;
}

export function inkCharacterWidth(text: string): number {
	const width = widthCache.get(text);
	if (width !== undefined) {
		return width;
	}

	let calculatedWidth: number;
	try {
		calculatedWidth = currentStringWidth(text);
	} catch {
		calculatedWidth = 1;
		console.warn(
			`Failed to calculate string width for ${JSON.stringify(text)}`,
		);
	}

	widthCache.set(text, calculatedWidth);
	return calculatedWidth;
}

export function wordBreakStyledChars(line: StyledLine): StyledLine[] {
	const words: StyledLine[] = [];
	let currentWord = new StyledLine();

	for (let i = 0; i < line.length; i++) {
		const val = line.getValue(i);
		const flags = line.getFormatFlags(i);
		const fg = line.getFgColor(i);
		const bg = line.getBgColor(i);
		const link = line.getLink(i);

		if (val === '\n' || val === ' ') {
			if (currentWord.length > 0) {
				words.push(currentWord);
			}

			currentWord = new StyledLine();
			const spaceLine = new StyledLine();
			spaceLine.pushChar(val, flags, fg, bg, link);
			words.push(spaceLine);
		} else {
			currentWord.pushChar(val, flags, fg, bg, link);
		}
	}

	if (currentWord.length > 0) {
		words.push(currentWord);
	}

	return words;
}

export function splitStyledCharsByNewline(line: StyledLine): StyledLine[] {
	const lines: StyledLine[] = [new StyledLine()];

	for (let i = 0; i < line.length; i++) {
		const val = line.getValue(i);
		if (val === '\n') {
			lines.push(new StyledLine());
		} else {
			lines
				.at(-1)!
				.pushChar(
					val,
					line.getFormatFlags(i),
					line.getFgColor(i),
					line.getBgColor(i),
					line.getLink(i),
				);
		}
	}

	return lines;
}

export function widestLineFromStyledChars(lines: StyledLine[]): number {
	let maxWidth = 0;
	for (const line of lines) {
		maxWidth = Math.max(maxWidth, styledCharsWidth(line));
	}

	return maxWidth;
}

export function styledCharsToString(line: StyledLine): string {
	return line.getValues().join('');
}

export function measureStyledChars(line: StyledLine): {
	width: number;
	height: number;
} {
	if (line.length === 0) {
		return {width: 0, height: 0};
	}

	const lines = splitStyledCharsByNewline(line);
	const width = widestLineFromStyledChars(lines);
	const height = lines.length;
	return {width, height};
}

export function getPositionAtOffset(
	line: StyledLine,
	targetOffset: number,
): {row: number; col: number} {
	let row = 0;
	let col = 0;
	let charCount = 0;

	for (let i = 0; i < line.length; i++) {
		if (charCount >= targetOffset) {
			break;
		}

		const val = line.getValue(i);
		if (val === '\n') {
			row++;
			col = 0;
		} else {
			col += inkCharacterWidth(val);
		}

		charCount += val.length;
	}

	return {row, col};
}
