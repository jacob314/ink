import stringWidth from 'string-width';
import {tokenize} from '@alcalzone/ansi-tokenize';

type StringWidth = (text: string) => number;

const defaultStringWidth: StringWidth = stringWidth;

let currentStringWidth: StringWidth = defaultStringWidth;
const cache = new Map<string, Output>();

export function setStringWidthFunction(fn: StringWidth) {
	currentStringWidth = fn;
	cache.clear();
}

export function clearStringWidthCache() {
	cache.clear();
}

export function inkStringWidth(text: string): number {
	/// XXX tokenize needs to use merging logic.
	const tokens = tokenize(text);
	let length = 0;
	for (const token of tokens) {
		if (token.type === 'char') {
			length += inkCharacterWidth(token.value);
		}
	}

	return length;
}

export function inkCharacterWidth(text: string): number {
	return currentStringWidth(text);
}

function widestLine(text: string): number {
	let lineWidth = 0;

	for (const line of text.split('\n')) {
		lineWidth = Math.max(lineWidth, inkStringWidth(line));
	}

	return lineWidth;
}

type Output = {
	width: number;
	height: number;
};

const measureText = (text: string): Output => {
	if (text.length === 0) {
		return {
			width: 0,
			height: 0,
		};
	}

	const cachedDimensions = cache.get(text);

	if (cachedDimensions) {
		return cachedDimensions;
	}

	const width = widestLine(text);
	const height = text.split('\n').length;
	const dimensions = {width, height};
	cache.set(text, dimensions);

	return dimensions;
};

export default measureText;