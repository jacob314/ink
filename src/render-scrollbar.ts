import {type StyledChar} from '@alcalzone/ansi-tokenize';
import colorize from './colorize.js';
import {toStyledCharacters} from './measure-text.js';

export type ScrollbarThumb = {
	startIndex: number;
	endIndex: number;
	thumbStartHalf: number;
	thumbEndHalf: number;
};

export type DrawOptions = {
	x: number;
	y: number;
	thumb: ScrollbarThumb;
	clip: {
		x: number;
		y: number;
		w: number;
		h: number;
	};
	axis: 'vertical' | 'horizontal';
	color?: string;
	setChar: (x: number, y: number, char: StyledChar) => void;
};

export const renderScrollbar = ({
	x,
	y,
	thumb,
	clip,
	axis,
	color,
	setChar,
}: DrawOptions) => {
	const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} = thumb;

	if (axis === 'vertical') {
		for (let i = startIndex; i < endIndex; i++) {
			const drawY = y + i;
			const drawX = x;

			if (
				drawY >= clip.y &&
				drawY < clip.y + clip.h &&
				drawX >= clip.x &&
				drawX < clip.x + clip.w
			) {
				let char = '█';
				const hasUpper = 2 * i >= thumbStartHalf && 2 * i < thumbEndHalf;
				const hasLower =
					2 * i + 1 >= thumbStartHalf && 2 * i + 1 < thumbEndHalf;

				if (hasUpper && !hasLower) {
					char = '▀';
				} else if (!hasUpper && hasLower) {
					char = '▄';
				}

				const charString = color ? colorize(char, color, 'foreground') : char;
				const styled = toStyledCharacters(charString)[0];

				if (styled) {
					setChar(drawX, drawY, styled);
				}
			}
		}
	} else {
		for (let i = startIndex; i < endIndex; i++) {
			const drawX = x + i;
			const drawY = y;

			if (
				drawY >= clip.y &&
				drawY < clip.y + clip.h &&
				drawX >= clip.x &&
				drawX < clip.x + clip.w
			) {
				let char = '█';
				const hasLeft = 2 * i >= thumbStartHalf && 2 * i < thumbEndHalf;
				const hasRight =
					2 * i + 1 >= thumbStartHalf && 2 * i + 1 < thumbEndHalf;

				if (hasLeft && !hasRight) {
					char = '▌';
				} else if (!hasLeft && hasRight) {
					char = '▐';
				}

				const charString = color ? colorize(char, color, 'foreground') : char;
				const styled = toStyledCharacters(charString)[0];

				if (styled) {
					setChar(drawX, drawY, styled);
				}
			}
		}
	}
};
