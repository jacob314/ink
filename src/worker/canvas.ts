import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {type RenderLine} from './terminal-writer.js';

export type Rect = {
	x: number;
	y: number;
	w: number;
	h: number;
};

/**
 * A 2D drawing surface for terminal characters.
 * Handles clipping and bounds checking.
 */
export class Canvas {
	/**
	 * Creates a new Canvas from a set of lines.
	 */
	static fromLines(width: number, height: number, lines: RenderLine[]): Canvas {
		return new Canvas(width, height, lines);
	}

	/**
	 * Creates an empty Canvas with the given dimensions.
	 */
	static create(width: number, height: number, tainted = false): Canvas {
		const lines: RenderLine[] = [];
		for (let i = 0; i < height; i++) {
			lines.push({
				styledChars: [],
				text: '',
				length: 0,
				tainted,
			});
		}

		return new Canvas(width, height, lines);
	}

	constructor(
		public readonly width: number,
		public readonly height: number,
		private readonly lines: RenderLine[],
	) {}

	/**
	 * Sets a character at the given coordinates, respecting clipping.
	 */
	setChar(x: number, y: number, char: StyledChar, clip?: Rect) {
		if (y < 0 || y >= this.height || x < 0 || x >= this.width) {
			return;
		}

		if (
			clip &&
			(x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h)
		) {
			return;
		}

		const line = this.lines[y];
		if (!line) {
			return;
		}

		// Ensure the line is long enough
		while (line.styledChars.length <= x) {
			line.styledChars.push({
				type: 'char',
				value: ' ',
				fullWidth: false,
				styles: [],
			});
		}

		line.styledChars[x] = char;
	}

	/**
	 * Draws a sequence of characters starting at (x, y).
	 */
	drawStyledChars(x: number, y: number, chars: StyledChar[], clip?: Rect) {
		for (const [i, char] of chars.entries()) {
			this.setChar(x + i, y, char, clip);
		}
	}

	/**
	 * Returns the underlying lines.
	 */
	getLines(): RenderLine[] {
		return this.lines;
	}
}
