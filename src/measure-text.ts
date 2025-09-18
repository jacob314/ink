import stringWidth from 'string-width';
import {
	tokenize,
	styledCharsFromTokens,
	type StyledChar,
} from '@alcalzone/ansi-tokenize';

export type StringWidth = (text: string) => number;

const defaultStringWidth: StringWidth = stringWidth;

let currentStringWidth: StringWidth = defaultStringWidth;

// This cache must be cleared each time the output is changed.
const widthCache = new Map<string, number>();

// This cache can persist for the lifetime of the application.
const toStyledCharactersCache = new Map<string, StyledChar[]>();

export function setStringWidthFunction(fn: StringWidth) {
	currentStringWidth = fn;
	// Clear the width cache to avoid stale values.
	clearStringWidthCache();
}

export function clearStringWidthCache() {
	widthCache.clear();
}

function _combineChars(
	character: StyledChar,
	characters: StyledChar[],
	i: number,
): [string, number] {
	let {value} = character;
	while (i + 1 < characters.length) {
		const nextCharacter = characters[i + 1];

		if (!nextCharacter) {
			break;
		}

		const codePoints = [...nextCharacter.value].map(char =>
			char.codePointAt(0),
		);

		const firstCodePoint = codePoints[0];

		// Variation selectors
		const isVariationSelector =
			firstCodePoint! >= 0xfe_00 && firstCodePoint! <= 0xfe_0f;

		// Skin tone modifiers
		const isSkinToneModifier =
			firstCodePoint! >= 0x1_f3_fb && firstCodePoint! <= 0x1_f3_ff;

		const isZeroWidthJoiner = firstCodePoint === 0x20_0d;
		const isKeycap = firstCodePoint === 0x20_e3;

		// Tags block (U+E0000 - U+E007F)
		const isTagsBlock =
			firstCodePoint! >= 0xe_00_00 && firstCodePoint! <= 0xe_00_7f;

		// Combining Diacritical Marks
		const isCombiningMark =
			firstCodePoint! >= 0x03_00 && firstCodePoint! <= 0x03_6f;

		const isCombining =
			isVariationSelector ||
			isSkinToneModifier ||
			isZeroWidthJoiner ||
			isKeycap ||
			isTagsBlock ||
			isCombiningMark;

		if (!isCombining) {
			break;
		}

		// Merge with previous character
		value += nextCharacter.value;
		i++; // Consume next character.

		// If it was a ZWJ, also consume the character after it.
		if (isZeroWidthJoiner && i + 1 < characters.length) {
			const characterAfterZwj = characters[i + 1];

			if (characterAfterZwj) {
				value += characterAfterZwj.value;
				i++; // Consume character after ZWJ.
			}
		}
	}

	return [value, i];
}

function _combineRegionalIndicators(
	character: StyledChar,
	characters: StyledChar[],
	i: number,
): [string, number] | undefined {
	const firstCodePoint = character.value.codePointAt(0);

	if (
		firstCodePoint! >= 0x1_f1_e6 &&
		firstCodePoint! <= 0x1_f1_ff &&
		i + 1 < characters.length
	) {
		const nextCharacter = characters[i + 1];

		if (nextCharacter) {
			const nextFirstCodePoint = nextCharacter.value.codePointAt(0);

			if (
				nextFirstCodePoint! >= 0x1_f1_e6 &&
				nextFirstCodePoint! <= 0x1_f1_ff
			) {
				return [character.value + nextCharacter.value, i + 1];
			}
		}
	}

	return undefined;
}

export function toStyledCharacters(text: string): StyledChar[] {
	if (toStyledCharactersCache.has(text)) {
		return toStyledCharactersCache.get(text)!;
	}

	const tokens = tokenize(text);
	const characters = styledCharsFromTokens(tokens);
	const combinedCharacters: StyledChar[] = [];

	for (let i = 0; i < characters.length; i++) {
		const character = characters[i];
		if (!character) {
			continue;
		}

		if (character.value === '\t') {
			const spaceCharacter: StyledChar = {...character, value: ' '};

			combinedCharacters.push(
				spaceCharacter,
				spaceCharacter,
				spaceCharacter,
				spaceCharacter,
			);
			continue;
		}

		if (character.value === '\b') {
			continue;
		}

		// Regional indicator characters are composed of two characters, so we need to combine them.
		// See: https://en.wikipedia.org/wiki/Regional_indicator_symbol
		const regionalResult = _combineRegionalIndicators(character, characters, i);
		if (regionalResult) {
			const [value, newI] = regionalResult;
			combinedCharacters.push({
				...character,
				value,
			});
			i = newI;
			continue;
		}

		let modified = false;
		let value: string;
		// Look ahead for combining characters.
		// See: https://en.wikipedia.org/wiki/Combining_character
		if (i + 1 < characters.length) {
			const [newValue, newI] = _combineChars(character, characters, i);
			if (i === newI) {
				value = character.value;
			} else {
				modified = true;
				i = newI;
				value = newValue;
			}
		} else {
			value = character.value;
		}

		combinedCharacters.push(modified ? {...character, value} : character);
	}

	toStyledCharactersCache.set(text, combinedCharacters);
	return combinedCharacters;
}

export function styledCharsWidth(styledChars: StyledChar[]): number {
	let length = 0;
	for (const char of styledChars) {
		length += inkCharacterWidth(char.value);
	}

	return length;
}

export function inkCharacterWidth(text: string): number {
	const width = widthCache.get(text);
	if (width !== undefined) {
		return width;
	}

	const calculatedWidth = currentStringWidth(text);
	widthCache.set(text, calculatedWidth);
	return calculatedWidth;
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
