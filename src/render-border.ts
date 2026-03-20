import cliBoxes from 'cli-boxes';
import chalk from 'chalk';
import colorize from './colorize.js';
import {type DOMNode} from './dom.js';
import type Output from './output.js';
import {toStyledCharacters} from './measure-text.js';
import {type StyledChar} from '@alcalzone/ansi-tokenize';

const renderBorder = (
	x: number,
	y: number,
	node: DOMNode,
	output: Output,
): void => {
	if (node.style.borderStyle) {
		const width = node.yogaNode!.getComputedWidth();
		const height = node.yogaNode!.getComputedHeight();
		const currentClip = output.getCurrentClip();
		
		const borderInfo = {
			x,
			y,
			width,
			height,
			borderStyle: node.style.borderStyle,
			borderColor: node.style.borderColor,
			borderTopColor: node.style.borderTopColor,
			borderBottomColor: node.style.borderBottomColor,
			borderLeftColor: node.style.borderLeftColor,
			borderRightColor: node.style.borderRightColor,
			borderDimColor: node.style.borderDimColor,
			borderTopDimColor: node.style.borderTopDimColor,
			borderBottomDimColor: node.style.borderBottomDimColor,
			borderLeftDimColor: node.style.borderLeftDimColor,
			borderRightDimColor: node.style.borderRightDimColor,
			showBorderTop: node.style.borderTop !== false,
			showBorderBottom: node.style.borderBottom !== false,
			showBorderLeft: node.style.borderLeft !== false,
			showBorderRight: node.style.borderRight !== false,
			clip: currentClip
		};
		
		const region = output.getActiveRegion();
		if (!region.borders) region.borders = [];
		region.borders.push(borderInfo);
	}
};

export const drawRegionBorders = (
	border: any,
	regionAbsX: number,
	regionAbsY: number,
	clip: {x: number; y: number; w: number; h: number},
	setChar: (x: number, y: number, char: StyledChar) => void
): void => {
	const box =
		typeof border.borderStyle === 'string'
			? cliBoxes[border.borderStyle as keyof typeof cliBoxes]
			: border.borderStyle;

	const {width, height, showBorderTop, showBorderBottom, showBorderLeft, showBorderRight, clip: borderClip} = border;
	
	let effectiveClip = clip;
	if (borderClip) {
		const bClipX = borderClip.x1 ?? -Infinity;
		const bClipY = borderClip.y1 ?? -Infinity;
		const bClipX2 = borderClip.x2 ?? Infinity;
		const bClipY2 = borderClip.y2 ?? Infinity;
		
		const eX1 = Math.max(clip.x, bClipX);
		const eY1 = Math.max(clip.y, bClipY);
		const eX2 = Math.min(clip.x + clip.w, bClipX2);
		const eY2 = Math.min(clip.y + clip.h, bClipY2);
		
		effectiveClip = (eX2 > eX1 && eY2 > eY1)
			? {x: eX1, y: eY1, w: eX2 - eX1, h: eY2 - eY1}
			: {x: 0, y: 0, w: 0, h: 0};
	}
	
	const topBorderColor = border.borderTopColor ?? border.borderColor;
	const bottomBorderColor = border.borderBottomColor ?? border.borderColor;
	const leftBorderColor = border.borderLeftColor ?? border.borderColor;
	const rightBorderColor = border.borderRightColor ?? border.borderColor;

	const dimTopBorderColor = border.borderTopDimColor ?? border.borderDimColor;
	const dimBottomBorderColor = border.borderBottomDimColor ?? border.borderDimColor;
	const dimLeftBorderColor = border.borderLeftDimColor ?? border.borderDimColor;
	const dimRightBorderColor = border.borderRightDimColor ?? border.borderDimColor;

	const contentWidth = width - (showBorderLeft ? 1 : 0) - (showBorderRight ? 1 : 0);

	const boxX = regionAbsX + border.x;
	const boxY = regionAbsY + border.y;

	const drawString = (dx: number, dy: number, str: string) => {
		if (dy < effectiveClip.y || dy >= effectiveClip.y + effectiveClip.h) return;
		const chars = toStyledCharacters(str);
		let currentX = dx;
		for (const char of chars) {
			if (currentX >= effectiveClip.x && currentX < effectiveClip.x + effectiveClip.w) {
				setChar(currentX, dy, char);
			}
			currentX += char.fullWidth ? 2 : 1;
		}
	};

	if (showBorderTop) {
		let topBorder = colorize(
			(showBorderLeft ? box.topLeft : '') +
				box.top.repeat(contentWidth) +
				(showBorderRight ? box.topRight : ''),
			topBorderColor,
			'foreground',
		);
		if (dimTopBorderColor) topBorder = chalk.dim(topBorder);
		drawString(boxX, boxY, topBorder);
	}

	if (showBorderBottom) {
		let bottomBorder = colorize(
			(showBorderLeft ? box.bottomLeft : '') +
				box.bottom.repeat(contentWidth) +
				(showBorderRight ? box.bottomRight : ''),
			bottomBorderColor,
			'foreground',
		);
		if (dimBottomBorderColor) bottomBorder = chalk.dim(bottomBorder);
		drawString(boxX, boxY + height - 1, bottomBorder);
	}

	if (showBorderLeft) {
		let leftBorderStr = colorize(box.left, leftBorderColor, 'foreground');
		if (dimLeftBorderColor) leftBorderStr = chalk.dim(leftBorderStr);
		const offsetY = showBorderTop ? 1 : 0;
		const borderHeight = height - (showBorderTop ? 1 : 0) - (showBorderBottom ? 1 : 0);
		for (let i = 0; i < borderHeight; i++) {
			drawString(boxX, boxY + offsetY + i, leftBorderStr);
		}
	}

	if (showBorderRight) {
		let rightBorderStr = colorize(box.right, rightBorderColor, 'foreground');
		if (dimRightBorderColor) rightBorderStr = chalk.dim(rightBorderStr);
		const offsetY = showBorderTop ? 1 : 0;
		const borderHeight = height - (showBorderTop ? 1 : 0) - (showBorderBottom ? 1 : 0);
		for (let i = 0; i < borderHeight; i++) {
			drawString(boxX + width - 1, boxY + offsetY + i, rightBorderStr);
		}
	}
};

export default renderBorder;
