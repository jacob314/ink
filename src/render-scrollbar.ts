import {getForegroundColorEscape} from './colorize.js';
import {type ScrollbarBoundingBox} from './measure-element.js';

export type ScrollbarThumb = {
	startIndex: number;
	endIndex: number;
	thumbStartHalf: number;
	thumbEndHalf: number;
};

export type DrawOptions = {
	layout: ScrollbarBoundingBox;
	clip: {
		x: number;
		y: number;
		w: number;
		h: number;
	};
	axis: 'vertical' | 'horizontal';
	color?: string;
	setChar: (
		x: number,
		y: number,
		value: string,
		formatFlags: number,
		fgColor?: string,
		bgColor?: string,
		link?: string,
	) => void;
	getExistingChar?: (x: number, y: number) => {bgColor?: string} | undefined;
};

export const renderScrollbar = ({
	layout,
	clip,
	axis,
	color,
	setChar,
	getExistingChar,
}: DrawOptions) => {
	const {
		x,
		y,
		thumb: {
			start: startIndex,
			end: endIndex,
			startHalf: thumbStartHalf,
			endHalf: thumbEndHalf,
		},
	} = layout;

	const fgColor = color ? getForegroundColorEscape(color) : undefined;

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

				let bgColor: string | undefined;
				if (getExistingChar && (char === '▀' || char === '▄')) {
					const existing = getExistingChar(drawX, drawY);
					if (existing?.bgColor) {
						bgColor = existing.bgColor;
					}
				}

				setChar(
					drawX,
					drawY,
					char,
					0,
					fgColor,
					bgColor,
					undefined,
				);
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

				let bgColor: string | undefined;
				if (getExistingChar && (char === '▌' || char === '▐')) {
					const existing = getExistingChar(drawX, drawY);
					if (existing?.bgColor) {
						bgColor = existing.bgColor;
					}
				}

				setChar(
					drawX,
					drawY,
					char,
					0,
					fgColor,
					bgColor,
					undefined,
				);
			}
		}
	}
};
