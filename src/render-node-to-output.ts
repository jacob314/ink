import {type StyledChar} from '@alcalzone/ansi-tokenize';
import Yoga from 'yoga-layout';
import {debugLog} from './debug-log.js';
import {wrapOrTruncateStyledChars} from './text-wrap.js';
import getMaxWidth from './get-max-width.js';
import squashTextNodes from './squash-text-nodes.js';
import renderBorder from './render-border.js';
import renderBackground from './render-background.js';
import {type DOMElement, type DOMNode, setCachedRender} from './dom.js';
import Output from './output.js';
import {
	measureStyledChars,
	splitStyledCharsByNewline,
	toStyledCharacters,
} from './measure-text.js';

// If parent container is `<Box>`, text nodes will be treated as separate nodes in
// the tree and will have their own coordinates in the layout.
// To ensure text nodes are aligned correctly, take X and Y of the first text node
// and use it as offset for the rest of the nodes
// Only first node is taken into account, because other text nodes can't have margin or padding,
// so their coordinates will be relative to the first node anyway
const applyPaddingToStyledChars = (
	node: DOMElement,
	lines: StyledChar[][],
): StyledChar[][] => {
	const yogaNode = node.childNodes[0]?.yogaNode;

	if (yogaNode) {
		const offsetX = yogaNode.getComputedLeft();
		const offsetY = yogaNode.getComputedTop();

		const space: StyledChar = {
			type: 'char',
			value: ' ',
			fullWidth: false,
			styles: [],
		};

		const paddingLeft = Array.from({length: offsetX}).map(() => space);

		lines = lines.map(line => [...paddingLeft, ...line]);

		const paddingTop: StyledChar[][] = Array.from({length: offsetY}).map(
			() => [],
		);
		lines.unshift(...paddingTop);
	}

	return lines;
};

const applySelectionToStyledChars = (
	styledChars: StyledChar[],
	selectionState: {range: {start: number; end: number}; currentOffset: number},
	selectionStyle?: (char: StyledChar) => StyledChar,
): StyledChar[] => {
	const {range, currentOffset} = selectionState;
	const {start, end} = range;
	let charCodeUnitOffset = 0;
	const newStyledChars: StyledChar[] = [];

	for (const char of styledChars) {
		const charLength = char.value.length;
		const globalOffset = currentOffset + charCodeUnitOffset;

		if (globalOffset >= start && globalOffset < end) {
			if (selectionStyle) {
				newStyledChars.push(selectionStyle(char));
			} else {
				// 7 is the ANSI code for inverse (reverse video)
				const newChar = {
					...char,
					styles: [...char.styles],
				};

				newChar.styles.push({
					type: 'ansi',
					code: '\u001B[7m',
					endCode: '\u001B[27m',
				});

				newStyledChars.push(newChar);
			}
		} else {
			newStyledChars.push(char);
		}

		charCodeUnitOffset += charLength;
	}

	selectionState.currentOffset += charCodeUnitOffset;

	return newStyledChars;
};

export type OutputTransformer = (s: string, index: number) => string;

export const renderNodeToScreenReaderOutput = (
	node: DOMElement,
	options: {
		parentRole?: string;
		skipStaticElements?: boolean;
	} = {},
): string => {
	if (options.skipStaticElements && node.internal_static) {
		return '';
	}

	if (node.internalStickyAlternate) {
		return '';
	}

	if (node.yogaNode?.getDisplay() === Yoga.DISPLAY_NONE) {
		return '';
	}

	let output = '';

	if (node.nodeName === 'ink-text') {
		output = squashTextNodes(node);
	} else if (node.nodeName === 'ink-box' || node.nodeName === 'ink-root') {
		const separator =
			node.style.flexDirection === 'row' ||
			node.style.flexDirection === 'row-reverse'
				? ' '
				: '\n';

		const childNodes =
			node.style.flexDirection === 'row-reverse' ||
			node.style.flexDirection === 'column-reverse'
				? [...node.childNodes].reverse()
				: [...node.childNodes];

		output = childNodes
			.map(childNode => {
				const screenReaderOutput = renderNodeToScreenReaderOutput(
					childNode as DOMElement,
					{
						parentRole: node.internal_accessibility?.role,
						skipStaticElements: options.skipStaticElements,
					},
				);
				return screenReaderOutput;
			})
			.filter(Boolean)
			.join(separator);
	}

	if (node.internal_accessibility) {
		const {role, state} = node.internal_accessibility;

		if (state) {
			const stateKeys = Object.keys(state) as Array<keyof typeof state>;
			const stateDescription = stateKeys.filter(key => state[key]).join(', ');

			if (stateDescription) {
				output = `(${stateDescription}) ${output}`;
			}
		}

		if (role && role !== options.parentRole) {
			output = `${role}: ${output}`;
		}
	}

	return output;
};

export const renderToStatic = (
	node: DOMElement,
	options: {
		calculateLayout?: boolean;
		skipStaticElements?: boolean;
		isStickyRender?: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	} = {},
) => {
	debugLog(`renderToStatic called for ${node.nodeName}`);
	if (options.calculateLayout && node.yogaNode) {
		node.yogaNode.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
	}

	const width = node.yogaNode?.getComputedWidth() ?? 0;
	const height = node.yogaNode?.getComputedHeight() ?? 0;

	const staticOutput = new Output({
		width,
		height,
	});

	for (const childNode of node.childNodes) {
		renderNodeToOutput(childNode as DOMElement, staticOutput, {
			offsetX: 0,
			offsetY: 0,
			transformers: undefined,
			skipStaticElements: options.skipStaticElements ?? false,
			nodeToSkip: undefined,
			isStickyRender: options.isStickyRender,
			selectionMap: options.selectionMap,
			selectionStyle: options.selectionStyle,
		});
	}

	const {lines: styledOutput} = staticOutput.get();

	setCachedRender(node, {
		output: styledOutput,
		width,
		height,
	});
};

// After nodes are laid out, render each to output object, which later gets rendered to terminal
function renderNodeToOutput(
	node: DOMElement,
	output: Output,
	options: {
		offsetX?: number;
		offsetY?: number;
		transformers?: OutputTransformer[];
		skipStaticElements: boolean;
		nodeToSkip?: DOMElement;
		isStickyRender?: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
) {
	if (options.nodeToSkip === node) {
		return;
	}

	const {
		offsetX = 0,
		offsetY = 0,
		transformers = [],
		skipStaticElements,
		isStickyRender = false,
		selectionMap,
		selectionStyle,
	} = options;

	if (skipStaticElements && node.internal_static) {
		return;
	}

	if (node.internalStickyAlternate && !isStickyRender) {
		return;
	}

	const {yogaNode} = node;

	if (yogaNode) {
		if (yogaNode.getDisplay() === Yoga.DISPLAY_NONE) {
			return;
		}

		// Left and top positions in Yoga are relative to their parent node
		const x = offsetX + yogaNode.getComputedLeft();
		const y = offsetY + yogaNode.getComputedTop();

		const width = yogaNode.getComputedWidth();
		const height = yogaNode.getComputedHeight();
		const clip = output.getCurrentClip();

		if (clip) {
			const nodeLeft = x;
			const nodeRight = x + width;
			const nodeTop = y;
			const nodeBottom = y + height;

			const clipLeft = clip.x1 ?? -Infinity;
			const clipRight = clip.x2 ?? Infinity;
			const clipTop = clip.y1 ?? -Infinity;
			const clipBottom = clip.y2 ?? Infinity;

			const isVisible =
				nodeRight > clipLeft &&
				nodeLeft < clipRight &&
				nodeBottom > clipTop &&
				nodeTop < clipBottom;

			if (!isVisible) {
				return;
			}
		}

		// Transformers are functions that transform final text output of each component
		// See Output class for logic that applies transformers
		let newTransformers = transformers;
		if (typeof node.internal_transform === 'function') {
			newTransformers = [node.internal_transform, ...transformers];
		}

		if (node.nodeName === 'ink-static-render' && !node.cachedRender) {
			debugLog('Skipping render as cache already avaiable\n');
			return;
		}

		if (node.cachedRender) {
			let index = 0;
			let endIndex = node.cachedRender.output.length;

			if (clip) {
				const clipY1 = clip.y1 ?? -Infinity;
				const clipY2 = clip.y2 ?? Infinity;

				index = Math.max(0, Math.ceil(clipY1 - y));
				endIndex = Math.min(endIndex, Math.ceil(clipY2 - y));
			}

			for (; index < endIndex; index++) {
				const line = node.cachedRender.output[index];

				if (line) {
					output.write(x, y + index, line, {
						transformers: newTransformers,
						lineIndex: index,
					});
				}
			}

			return;
		}

		if (node.nodeName === 'ink-text') {
			let styledChars = toStyledCharacters(squashTextNodes(node));
			let selectionState:
				| {
						range: {start: number; end: number};
						currentOffset: number;
				  }
				| undefined;

			const selectionRange = selectionMap?.get(node);

			if (selectionRange) {
				selectionState = {
					range: selectionRange,
					currentOffset: 0,
				};
			}

			if (selectionState) {
				styledChars = applySelectionToStyledChars(
					styledChars,
					selectionState,
					selectionStyle,
				);
			}

			if (styledChars.length > 0) {
				let lines: StyledChar[][] = [];
				const {width: currentWidth} = measureStyledChars(styledChars);
				const maxWidth = getMaxWidth(yogaNode);

				if (currentWidth > maxWidth) {
					const textWrap = node.style.textWrap ?? 'wrap';
					lines = wrapOrTruncateStyledChars(styledChars, maxWidth, textWrap);
				} else {
					lines = splitStyledCharsByNewline(styledChars);
				}

				lines = applyPaddingToStyledChars(node, lines);

				for (const [index, line] of lines.entries()) {
					output.write(x, y + index, line, {
						transformers: newTransformers,
						lineIndex: index,
					});
				}
			}

			return;
		}

		let clipped = false;
		let childrenOffsetY = y;
		let childrenOffsetX = x;
		let verticallyScrollable = false;
		let horizontallyScrollable = false;
		let activeStickyNode: DOMElement | undefined;
		let nextStickyNode: DOMElement | undefined;

		if (node.nodeName === 'ink-box') {
			renderBackground(x, y, node, output);
			renderBorder(x, y, node, output);

			const overflow = node.style.overflow ?? 'visible';
			const overflowX = node.style.overflowX ?? overflow;
			const overflowY = node.style.overflowY ?? overflow;

			verticallyScrollable = overflowY === 'scroll';
			horizontallyScrollable = overflowX === 'scroll';

			if (verticallyScrollable) {
				childrenOffsetY -= node.internal_scrollState?.scrollTop ?? 0;

				const stickyNodes = getStickyDescendants(node);

				if (stickyNodes.length > 0) {
					const scrollTop =
						(node.internal_scrollState?.scrollTop ?? 0) +
						yogaNode.getComputedBorder(Yoga.EDGE_TOP);
					let activeStickyNodeIndex = -1;

					for (const [index, stickyNode] of stickyNodes.entries()) {
						if (stickyNode.yogaNode) {
							const stickyNodeTop = getRelativeTop(stickyNode, node);
							if (stickyNodeTop < scrollTop) {
								const parent = stickyNode.parentNode!;
								if (parent?.yogaNode) {
									const parentTop = getRelativeTop(parent, node);
									const parentHeight = parent.yogaNode.getComputedHeight();
									if (parentTop + parentHeight > scrollTop) {
										activeStickyNode = stickyNode;
										activeStickyNodeIndex = index;
									}
								}
							}
						}
					}

					if (
						activeStickyNodeIndex !== -1 &&
						activeStickyNodeIndex + 1 < stickyNodes.length
					) {
						nextStickyNode = stickyNodes[activeStickyNodeIndex + 1];
					}
				}
			}

			if (horizontallyScrollable) {
				childrenOffsetX -= node.internal_scrollState?.scrollLeft ?? 0;
			}

			const clipHorizontally = overflowX === 'hidden' || overflowX === 'scroll';
			const clipVertically = overflowY === 'hidden' || overflowY === 'scroll';

			if (clipHorizontally || clipVertically) {
				const x1 = clipHorizontally
					? x + yogaNode.getComputedBorder(Yoga.EDGE_LEFT)
					: undefined;

				const x2 = clipHorizontally
					? x +
						yogaNode.getComputedWidth() -
						yogaNode.getComputedBorder(Yoga.EDGE_RIGHT)
					: undefined;

				const y1 = clipVertically
					? y + yogaNode.getComputedBorder(Yoga.EDGE_TOP)
					: undefined;

				const y2 = clipVertically
					? y +
						yogaNode.getComputedHeight() -
						yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM)
					: undefined;

				if (verticallyScrollable || horizontallyScrollable) {
					const scrollHeight = node.internal_scrollState?.scrollHeight ?? 0;
					const scrollWidth = node.internal_scrollState?.scrollWidth ?? 0;
					const scrollTop = node.internal_scrollState?.scrollTop ?? 0;
					const scrollLeft = node.internal_scrollState?.scrollLeft ?? 0;

					const borderLeft = yogaNode.getComputedBorder(Yoga.EDGE_LEFT);
					const borderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);

					output.startChildRegion({
						id: node.internal_id,
						x: x1 ?? x + borderLeft,
						y: y1 ?? y + borderTop,
						width: (x2 ?? x + width) - (x1 ?? x + borderLeft),
						height: (y2 ?? y + height) - (y1 ?? y + borderTop),
						isScrollable: true,
						scrollState: {
							scrollTop,
							scrollLeft,
							scrollHeight,
							scrollWidth,
						},
						scrollbarVisible: node.internal_scrollbar ?? true,
						overflowToBackbuffer: node.style.overflowToBackbuffer,
					});

					const childOffsetX = -borderLeft;
					const childOffsetY = -borderTop;

					for (const childNode of node.childNodes) {
						renderNodeToOutput(childNode as DOMElement, output, {
							offsetX: childOffsetX,
							offsetY: childOffsetY,
							transformers: newTransformers,
							skipStaticElements,
							nodeToSkip: activeStickyNode,
							isStickyRender,
							selectionMap,
							selectionStyle,
						});
					}

					output.endChildRegion();
				}

				output.clip({x1, x2, y1, y2});
				clipped = true;
			}
		}

		if (
			(node.nodeName as string) === 'ink-root' ||
			(node.nodeName as string) === 'ink-box'
		) {
			if (!(verticallyScrollable || horizontallyScrollable)) {
				for (const childNode of node.childNodes) {
					renderNodeToOutput(childNode as DOMElement, output, {
						offsetX: childrenOffsetX,
						offsetY: childrenOffsetY,
						transformers: newTransformers,
						skipStaticElements,
						nodeToSkip: activeStickyNode,
						isStickyRender,
						selectionMap,
						selectionStyle,
					});
				}
			}

			if (activeStickyNode?.yogaNode) {
				const alternateStickyNode = activeStickyNode.childNodes.find(
					childNode => (childNode as DOMElement).internalStickyAlternate,
				) as DOMElement | undefined;

				const nodeToRender = alternateStickyNode ?? activeStickyNode;
				const nodeToRenderYogaNode = nodeToRender.yogaNode;

				if (!nodeToRenderYogaNode) {
					return;
				}

				const stickyYogaNode = activeStickyNode.yogaNode;
				const borderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);
				const scrollTop = node.internal_scrollState?.scrollTop ?? 0;

				const parent = activeStickyNode.parentNode!;
				const parentYogaNode = parent.yogaNode!;
				const parentTop = getRelativeTop(parent, node);
				const parentHeight = parentYogaNode.getComputedHeight();
				const parentBottom = parentTop + parentHeight;
				const stickyNodeHeight = nodeToRenderYogaNode.getComputedHeight();
				const maxStickyTop = y - scrollTop + parentBottom - stickyNodeHeight;

				const naturalStickyY =
					y - scrollTop + getRelativeTop(activeStickyNode, node);
				const stuckStickyY = y + borderTop;

				let finalStickyY = Math.min(
					Math.max(stuckStickyY, naturalStickyY),
					maxStickyTop,
				);

				if (nextStickyNode?.yogaNode) {
					const nextStickyNodeTop = getRelativeTop(nextStickyNode, node);
					const nextStickyNodeTopInViewport = y - scrollTop + nextStickyNodeTop;
					if (nextStickyNodeTopInViewport < finalStickyY + stickyNodeHeight) {
						finalStickyY = nextStickyNodeTopInViewport - stickyNodeHeight;
					}
				}

				let offsetX: number;
				let offsetY: number;

				if (nodeToRender === alternateStickyNode) {
					const parentAbsoluteX = x + getRelativeLeft(parent, node);
					const stickyNodeAbsoluteX =
						parentAbsoluteX + stickyYogaNode.getComputedLeft();
					offsetX = stickyNodeAbsoluteX;
					offsetY = finalStickyY;
				} else {
					const parentAbsoluteX = x + getRelativeLeft(parent, node);
					offsetX = parentAbsoluteX;
					offsetY = finalStickyY - stickyYogaNode.getComputedTop();
				}

				// Create a temporary output to render the sticky header
				const stickyOutput = new Output({
					width: nodeToRenderYogaNode.getComputedWidth(),
					height: nodeToRenderYogaNode.getComputedHeight(),
				});

				renderNodeToOutput(nodeToRender, stickyOutput, {
					offsetX: 0, // Render at 0,0 in temp output
					offsetY: 0,
					transformers: newTransformers,
					skipStaticElements,
					isStickyRender: true,
					selectionMap,
					selectionStyle,
				});

				const {lines: styledOutput} = stickyOutput.get();

				output.addStickyHeader({
					nodeId: nodeToRender.internal_id,
					lines: styledOutput,
					x: offsetX,
					y: offsetY,
					startRow: offsetY - y, // Relative to scroll region top
					endRow: offsetY - y + stickyNodeHeight,
					scrollContainerId: node.internal_id,
				});
			}

			if (clipped) {
				output.unclip();
			}
		}
	}
}

function getStickyDescendants(node: DOMElement): DOMElement[] {
	const stickyDescendants: DOMElement[] = [];

	for (const child of node.childNodes) {
		if (child.nodeName === '#text') {
			continue;
		}

		const domChild = child;

		if (domChild.internalStickyAlternate) {
			continue;
		}

		if (domChild.internalSticky) {
			stickyDescendants.push(domChild);
		} else {
			const overflow = domChild.style.overflow ?? 'visible';
			const overflowX = domChild.style.overflowX ?? overflow;
			const overflowY = domChild.style.overflowY ?? overflow;
			const isScrollable = overflowX === 'scroll' || overflowY === 'scroll';

			if (!isScrollable && domChild.childNodes) {
				stickyDescendants.push(...getStickyDescendants(domChild));
			}
		}
	}

	return stickyDescendants;
}

function getRelativeTop(node: DOMElement, ancestor: DOMElement): number {
	if (!node.yogaNode) {
		return 0;
	}

	let top = node.yogaNode.getComputedTop();
	let parent = node.parentNode;

	while (parent && parent !== ancestor) {
		if (parent.yogaNode) {
			top += parent.yogaNode.getComputedTop();

			if (parent.nodeName === 'ink-box') {
				const overflow = parent.style.overflow ?? 'visible';
				const overflowY = parent.style.overflowY ?? overflow;

				if (overflowY === 'scroll') {
					top -= parent.internal_scrollState?.scrollTop ?? 0;
				}
			}
		}

		parent = parent.parentNode;
	}

	return top;
}

function getRelativeLeft(node: DOMElement, ancestor: DOMElement): number {
	if (!node.yogaNode) {
		return 0;
	}

	let left = node.yogaNode.getComputedLeft();
	let parent = node.parentNode;

	while (parent && parent !== ancestor) {
		if (parent.yogaNode) {
			left += parent.yogaNode.getComputedLeft();

			if (parent.nodeName === 'ink-box') {
				const overflow = parent.style.overflow ?? 'visible';
				const overflowX = parent.style.overflowX ?? overflow;

				if (overflowX === 'scroll') {
					left -= parent.internal_scrollState?.scrollLeft ?? 0;
				}
			}
		}

		parent = parent.parentNode;
	}

	return left;
}

export default renderNodeToOutput;
