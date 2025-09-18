import {stringWidth } from 'tty-strings';
import stripAnsi from 'strip-ansi';

export function inkStringWidth(text: string): number {
	return stringWidth(stripAnsi(text));
}

function widestLine(text:string):number {
	let lineWidth = 0;

	for (const line of text.split('\n')) {
		lineWidth = Math.max(lineWidth, inkStringWidth(line));
	}

	return lineWidth;
}
const cache = new Map<string, Output>();

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
