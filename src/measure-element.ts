import Yoga from 'yoga-layout';
import {type DOMElement} from './dom.js';
import {getScrollLeft, getScrollTop} from './scroll.js';

type Output = {
	/**
	Element width.
	*/
	width: number;

	/**
	Element height.
	*/
	height: number;
};

/**
Measure the dimensions of a particular `<Box>` element.
*/
const measureElement = (node: DOMElement): Output => ({
	width: node.yogaNode?.getComputedWidth() ?? 0,
	height: node.yogaNode?.getComputedHeight() ?? 0,
});

/**
 * Get an element's inner width.
 */
export const getInnerWidth = (node: DOMElement): number => {
	const {yogaNode} = node;

	if (!yogaNode) {
		return 0;
	}

	const width = yogaNode.getComputedWidth() ?? 0;
	const borderLeft = yogaNode.getComputedBorder(Yoga.EDGE_LEFT);
	const borderRight = yogaNode.getComputedBorder(Yoga.EDGE_RIGHT);

	return width - borderLeft - borderRight;
};

/*
 * Get an element's inner height.
 */
export const getInnerHeight = (node: DOMElement): number => {
	const {yogaNode} = node;

	if (!yogaNode) {
		return 0;
	}

	const height = yogaNode.getComputedHeight() ?? 0;
	const borderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);
	const borderBottom = yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);

	return height - borderTop - borderBottom;
};

/**
 * Get an element's position and dimensions relative to the root.
 */
export const getBoundingBox = (
	node: DOMElement,
): {x: number; y: number; width: number; height: number} => {
	const {yogaNode} = node;

	if (!yogaNode) {
		return {x: 0, y: 0, width: 0, height: 0};
	}

	const width = yogaNode.getComputedWidth() ?? 0;
	const height = yogaNode.getComputedHeight() ?? 0;

	let x = yogaNode.getComputedLeft();
	let y = yogaNode.getComputedTop();

	let parent = node.parentNode;
	while (parent?.yogaNode) {
		x += parent.yogaNode.getComputedLeft();
		y += parent.yogaNode.getComputedTop();

		if (parent.nodeName === 'ink-box') {
			const overflow = parent.style.overflow ?? 'visible';
			const overflowX = parent.style.overflowX ?? overflow;
			const overflowY = parent.style.overflowY ?? overflow;

			if (overflowY === 'scroll') {
				y -= getScrollTop(parent);
			}

			if (overflowX === 'scroll') {
				x -= getScrollLeft(parent);
			}
		}

		parent = parent.parentNode;
	}

	return {x, y, width, height};
};

export type ScrollbarBoundingBox = {
	x: number;
	y: number;
	width: number;
	height: number;
	thumb: {
		x: number;
		y: number;
		width: number;
		height: number;
		start: number;
		end: number;
		startHalf: number;
		endHalf: number;
	};
};

export function calculateScrollbarThumb(options: {
	scrollbarDimension: number;
	clientDimension: number;
	scrollDimension: number;
	scrollPosition: number;
	axis: 'vertical' | 'horizontal';
}): {
	startIndex: number;
	endIndex: number;
	thumbStartHalf: number;
	thumbEndHalf: number;
} {
	const {
		scrollbarDimension,
		clientDimension,
		scrollDimension,
		scrollPosition,
		axis,
	} = options;

	const scrollbarDimensionHalves = scrollbarDimension * 2;

	const thumbDimensionHalves = Math.max(
		axis === 'vertical' ? 2 : 1,
		Math.round((clientDimension / scrollDimension) * scrollbarDimensionHalves),
	);

	const maxScrollPosition = scrollDimension - clientDimension;
	const maxThumbPosition = scrollbarDimensionHalves - thumbDimensionHalves;

	const thumbPosition =
		maxScrollPosition > 0
			? Math.round((scrollPosition / maxScrollPosition) * maxThumbPosition)
			: 0;

	const thumbStartHalf = thumbPosition;
	const thumbEndHalf = thumbPosition + thumbDimensionHalves;

	const startIndex = Math.floor(thumbStartHalf / 2);
	const endIndex = Math.min(scrollbarDimension, Math.ceil(thumbEndHalf / 2));

	return {startIndex, endIndex, thumbStartHalf, thumbEndHalf};
}

/**
 * Get the bounding box of the vertical scrollbar.
 */
export const getVerticalScrollbarBoundingBox = (
	node: DOMElement,
	offset?: {x: number; y: number},
): ScrollbarBoundingBox | undefined => {
	const {yogaNode} = node;
	if (!yogaNode) {
		return undefined;
	}

	const overflow = node.style.overflow ?? 'visible';
	const overflowY = node.style.overflowY ?? overflow;

	if (overflowY !== 'scroll') {
		return undefined;
	}

	const clientHeight = node.internal_scrollState?.clientHeight ?? 0;
	const scrollHeight = node.internal_scrollState?.scrollHeight ?? 0;

	if (scrollHeight <= clientHeight) {
		return undefined;
	}

	const {x, y} = offset ?? getBoundingBox(node);
	const scrollbarHeight =
		yogaNode.getComputedHeight() -
		yogaNode.getComputedBorder(Yoga.EDGE_TOP) -
		yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);

	const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
		calculateScrollbarThumb({
			scrollbarDimension: scrollbarHeight,
			clientDimension: clientHeight,
			scrollDimension: scrollHeight,
			scrollPosition: node.internal_scrollState?.scrollTop ?? 0,
			axis: 'vertical',
		});

	const scrollbarX =
		x +
		yogaNode.getComputedWidth() -
		1 -
		yogaNode.getComputedBorder(Yoga.EDGE_RIGHT);
	const scrollbarY = y + yogaNode.getComputedBorder(Yoga.EDGE_TOP);

	return {
		x: scrollbarX,
		y: scrollbarY,
		width: 1,
		height: scrollbarHeight,
		thumb: {
			x: scrollbarX,
			y: scrollbarY + startIndex,
			width: 1,
			height: endIndex - startIndex,
			start: startIndex,
			end: endIndex,
			startHalf: thumbStartHalf,
			endHalf: thumbEndHalf,
		},
	};
};

/**
 * Get the bounding box of the horizontal scrollbar.
 */
export const getHorizontalScrollbarBoundingBox = (
	node: DOMElement,
	offset?: {x: number; y: number},
): ScrollbarBoundingBox | undefined => {
	const {yogaNode} = node;
	if (!yogaNode) {
		return undefined;
	}

	const overflow = node.style.overflow ?? 'visible';
	const overflowX = node.style.overflowX ?? overflow;

	if (overflowX !== 'scroll') {
		return undefined;
	}

	const clientWidth = node.internal_scrollState?.clientWidth ?? 0;
	const scrollWidth = node.internal_scrollState?.scrollWidth ?? 0;

	if (scrollWidth <= clientWidth) {
		return undefined;
	}

	const {x, y} = offset ?? getBoundingBox(node);

	const overflowY = node.style.overflowY ?? overflow;
	const clientHeight = node.internal_scrollState?.clientHeight ?? 0;
	const scrollHeight = node.internal_scrollState?.scrollHeight ?? 0;
	const isVerticalScrollbarVisible =
		overflowY === 'scroll' && scrollHeight > clientHeight;

	const scrollbarWidth =
		yogaNode.getComputedWidth() -
		yogaNode.getComputedBorder(Yoga.EDGE_LEFT) -
		yogaNode.getComputedBorder(Yoga.EDGE_RIGHT) -
		(isVerticalScrollbarVisible ? 1 : 0);

	const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
		calculateScrollbarThumb({
			scrollbarDimension: scrollbarWidth,
			clientDimension: clientWidth,
			scrollDimension: scrollWidth,
			scrollPosition: node.internal_scrollState?.scrollLeft ?? 0,
			axis: 'horizontal',
		});

	const scrollbarX = x + yogaNode.getComputedBorder(Yoga.EDGE_LEFT);
	const scrollbarY =
		y +
		yogaNode.getComputedHeight() -
		1 -
		yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);

	return {
		x: scrollbarX,
		y: scrollbarY,
		width: scrollbarWidth,
		height: 1,
		thumb: {
			x: scrollbarX + startIndex,
			y: scrollbarY,
			width: endIndex - startIndex,
			height: 1,
			start: startIndex,
			end: endIndex,
			startHalf: thumbStartHalf,
			endHalf: thumbEndHalf,
		},
	};
};

export default measureElement;
