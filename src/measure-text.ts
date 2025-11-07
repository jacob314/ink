import stringWidth from 'string-width';
import {
	type StyledChar,
} from '@alcalzone/ansi-tokenize';

export type StringWidth = (text: string) => number;

const defaultStringWidth: StringWidth = stringWidth;

let currentStringWidth: StringWidth = defaultStringWidth;

export function setStringWidthFunction(fn: StringWidth) {
	currentStringWidth = fn;
	// Clear the width cache to avoid stale values.
	clearStringWidthCache();
}

export function clearStringWidthCache() {
}

export function toStyledCharacters(text: string): StyledChar[] {
	const characters: StyledChar[] = [];

	const styles: StyledChar['styles'] = [];
	for (const char of text) {
		characters.push({
			type: 'char',
			value: char,
			fullWidth: false,
			styles: styles,
		});
	}

	return characters;
}

export function styledCharsWidth(styledChars: StyledChar[]): number {
	let length = 0;
	for (const char of styledChars) {
		length += inkCharacterWidth(char.value);
	}

	return length;
}

export function inkCharacterWidth(text: string): number {
	return currentStringWidth(text);
}

export function splitStyledCharsByNewline(
	styledChars: StyledChar[],
): StyledChar[][] {
	const lines: StyledChar[][] = [[]];

	for (const char of styledChars) {
		if (char.value === '\n') {
			lines.push([]);
		} else {
			lines.at(-1)!.push(char);
		}
	}

	return lines;
}

export function widestLineFromStyledChars(lines: StyledChar[][]): number {
	let maxWidth = 0;
	for (const line of lines) {
		maxWidth = Math.max(maxWidth, styledCharsWidth(line));
	}

	return maxWidth;
}

export function styledCharsToString(styledChars: StyledChar[]): string {
	let result = '';
	for (const char of styledChars) {
		result += char.value;
	}

	return result;
}

export function measureStyledChars(styledChars: StyledChar[]): {
	width: number;
	height: number;
} {
	if (styledChars.length === 0) {
		return {
			width: 0,
			height: 0,
		};
	}

	const lines = splitStyledCharsByNewline(styledChars);
	const width = widestLineFromStyledChars(lines);
	const height = lines.length;
	const dimensions = {width, height};
	return dimensions;
}
