import {type StyledChar} from '@alcalzone/ansi-tokenize';
import Yoga from 'yoga-layout';
import {wrapOrTruncateStyledChars} from './text-wrap.js';
import getMaxWidth from './get-max-width.js';
import squashTextNodes from './squash-text-nodes.js';
import renderBorder from './render-border.js';
import renderBackground from './render-background.js';
import {
	type DOMElement,
	type DOMNode,
	setCachedRender,
	type StickyHeader,
	isNodeSelectable,
} from './dom.js';
import Output, {
	isRectIntersectingClip,
	extractSelectableText,
} from './output.js';
import {
	measureStyledChars,
	splitStyledCharsByNewline,
	toStyledCharacters,
} from './measure-text.js';
import {
	getScrollHeight,
	getScrollWidth,
	getScrollTop,
	getScrollLeft,
} from './scroll.js';

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

const applySelectionStyle = (
	char: StyledChar,
	selectionStyle?: (char: StyledChar) => StyledChar,
): StyledChar => {
	if (selectionStyle) {
		return selectionStyle(char);
	}

	const newChar = {
		...char,
		styles: [...char.styles],
	};

	newChar.styles.push({
		type: 'ansi',
		code: '\u001B[7m',
		endCode: '\u001B[27m',
	});

	return newChar;
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
			newStyledChars.push(applySelectionStyle(char, selectionStyle));
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
	} else if (
		node.nodeName === 'ink-box' ||
		node.nodeName === 'ink-root' ||
		node.nodeName === 'ink-static-render'
	) {
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
	if (options.calculateLayout && node.yogaNode) {
		node.yogaNode.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
	}

	const width = node.yogaNode?.getComputedWidth() ?? 0;
	const height = node.yogaNode?.getComputedHeight() ?? 0;

	const stickyNodes = getStickyDescendants(node);
	const cachedStickyHeaders: StickyHeader[] = [];

	for (const {node: stickyNode} of stickyNodes) {
		const {naturalLines, stuckLines, naturalHeight, maxHeaderHeight} =
			renderStickyNode(stickyNode, {
				skipStaticElements: options.skipStaticElements ?? false,
				selectionMap: options.selectionMap,
				selectionStyle: options.selectionStyle,
			});

		const parent = stickyNode.parentNode;
		const parentYogaNode = parent?.yogaNode;
		const currentBorderTop =
			node.yogaNode?.getComputedBorder(Yoga.EDGE_TOP) ?? 0;
		const naturalRow = getRelativeTop(stickyNode, node) - currentBorderTop;

		const headerObj = {
			nodeId: stickyNode.internalId,
			lines: naturalLines,
			stuckLines,
			styledOutput: stuckLines ?? naturalLines,
			x:
				getRelativeLeft(stickyNode, node) -
				(node.yogaNode?.getComputedBorder(Yoga.EDGE_LEFT) ?? 0),
			y: getRelativeTop(stickyNode, node) - currentBorderTop,
			naturalRow,
			startRow: naturalRow,
			endRow: naturalRow + naturalHeight,
			scrollContainerId: -1,
			isStuckOnly: true,

			relativeX:
				getRelativeLeft(stickyNode, node) -
				(node.yogaNode?.getComputedBorder(Yoga.EDGE_LEFT) ?? 0),
			relativeY: getRelativeTop(stickyNode, node) - currentBorderTop,
			height: maxHeaderHeight,
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			type: (stickyNode.internalSticky === 'bottom' ? 'bottom' : 'top') as
				| 'top'
				| 'bottom',
			parentRelativeTop: parent
				? getRelativeTop(parent, node) - currentBorderTop
				: 0,
			parentHeight: parentYogaNode
				? parentYogaNode.getComputedHeight()
				: 1_000_000,
			parentBorderTop: parentYogaNode
				? parentYogaNode.getComputedBorder(Yoga.EDGE_TOP)
				: 0,
			parentBorderBottom: parentYogaNode
				? parentYogaNode.getComputedBorder(Yoga.EDGE_BOTTOM)
				: 0,
			node: stickyNode,
		};

		cachedStickyHeaders.push(headerObj);
	}

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
			nodesToSkip: undefined,
			isStickyRender: options.isStickyRender,
			selectionMap: options.selectionMap,
			selectionStyle: options.selectionStyle,
		});
	}

	const rootRegion = staticOutput.get();
	const {lines: styledOutput} = rootRegion;

	const spans = rootRegion.selectableSpans;
	const selectableText = extractSelectableText(spans);

	setCachedRender(node, {
		output: styledOutput,
		width,
		height,
		stickyHeaders: cachedStickyHeaders,
		root: rootRegion,
		selectableText,
	});
};

function handleCachedRenderNode(
	node: DOMElement,
	output: Output,
	options: {
		x: number;
		y: number;
		clip: {x1?: number; y1?: number; x2?: number; y2?: number} | undefined;
		newTransformers: OutputTransformer[];
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
) {
	const {x, y, clip, newTransformers, selectionMap, selectionStyle} = options;
	let handledSelection = false;

	if (selectionMap && selectionMap.has(node) && node.cachedRender!.root) {
		const range = selectionMap.get(node)!;
		const clonedRegionObj = {
			...node.cachedRender!.root,
			lines: node.cachedRender!.root.lines.map(line =>
				line.map(char => ({...char, styles: [...char.styles]})),
			),
			selectableSpans: node.cachedRender!.root.selectableSpans.map(span => ({
				...span,
			})),
			stickyHeaders: node.cachedRender!.root.stickyHeaders.map(header => ({
				...header,
			})),
			children: node.cachedRender!.root.children.map(child => ({...child})),
		};

		const spans = clonedRegionObj.selectableSpans;
		spans.sort((a, b) => (a.y === b.y ? a.startX - b.startX : a.y - b.y));

		let currentOffset = 0;
		let currentY = spans[0]?.y ?? 0;
		let currentX = spans[0]?.startX ?? 0;

		for (const span of spans) {
			if (span.y > currentY) {
				currentOffset += span.y - currentY;
				currentX = 0;
				currentY = span.y;
			}

			if (span.startX > currentX) {
				currentOffset += span.startX - currentX;
				currentX = span.startX;
			}

			let spanCharX = span.startX;
			const styledChars = toStyledCharacters(span.text);
			for (const char of styledChars) {
				const charLen = char.value.length;
				const charWidth = char.fullWidth ? 2 : 1;

				if (currentOffset >= range.start && currentOffset < range.end) {
					const line = clonedRegionObj.lines[span.y];
					if (line?.[spanCharX]) {
						line[spanCharX] = applySelectionStyle(
							line[spanCharX]!,
							selectionStyle,
						);
					}
				}

				currentOffset += charLen;
				spanCharX += charWidth;
			}

			currentX = span.endX;
		}

		output.addRegionTree(clonedRegionObj, x, y);
		handledSelection = true;
	}

	if (!handledSelection) {
		if (node.cachedRender!.root) {
			output.addRegionTree(node.cachedRender!.root, x, y);
		} else {
			let index = 0;
			let endIndex = node.cachedRender!.output.length;

			if (clip) {
				const clipY1 = clip.y1 ?? -Infinity;
				const clipY2 = clip.y2 ?? Infinity;

				index = Math.max(0, Math.ceil(clipY1 - y));
				endIndex = Math.min(endIndex, Math.ceil(clipY2 - y));
			}

			for (; index < endIndex; index++) {
				const line = node.cachedRender!.output[index];

				if (line) {
					output.write(x, y + index, line, {
						transformers: newTransformers,
						lineIndex: index,
					});
				}
			}
		}
	}
}

function handleTextNode(
	node: DOMElement,
	output: Output,
	options: {
		x: number;
		y: number;
		newTransformers: OutputTransformer[];
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
) {
	const {x, y, newTransformers, selectionMap, selectionStyle} = options;
	const text = squashTextNodes(node);
	let styledChars = toStyledCharacters(text);
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

	if (styledChars.length > 0 || node.internal_terminalCursorFocus) {
		let lines: StyledChar[][] = [];
		let cursorLineIndex = 0;
		let relativeCursorPosition = node.internal_terminalCursorPosition ?? 0;

		if (styledChars.length > 0) {
			const {width: currentWidth} = measureStyledChars(styledChars);
			const maxWidth = getMaxWidth(node.yogaNode!);

			lines =
				currentWidth > maxWidth
					? wrapOrTruncateStyledChars(
							styledChars,
							maxWidth,
							node.style.textWrap ?? 'wrap',
						)
					: splitStyledCharsByNewline(styledChars);

			lines = applyPaddingToStyledChars(node, lines);

			cursorLineIndex = lines.length - 1;

			if (
				node.internal_terminalCursorFocus &&
				node.internal_terminalCursorPosition !== undefined
			) {
				({cursorLineIndex, relativeCursorPosition} =
					calculateWrappedCursorPosition(
						lines,
						styledChars,
						node.internal_terminalCursorPosition,
					));
			}
		} else {
			lines = [[]];
		}

		for (const [index, line] of lines.entries()) {
			output.write(x, y + index, line, {
				transformers: newTransformers,
				lineIndex: index,
				isTerminalCursorFocused:
					node.internal_terminalCursorFocus && index === cursorLineIndex,
				terminalCursorPosition: relativeCursorPosition,
				isSelectable: isNodeSelectable(node),
			});
		}
	}
}

function identifyActiveStickyNodes(
	stickyNodes: StickyNodeInfo[],
	node: DOMElement,
	scrollTop: number,
	viewportBottom: number,
) {
	let activeTopStickyNodeIndex = -1;
	let activeTopStickyNode: StickyNodeInfo | undefined;
	let activeBottomStickyNodeIndex = -1;
	let activeBottomStickyNode: StickyNodeInfo | undefined;

	for (const [index, stickyNodeInfo] of stickyNodes.entries()) {
		const {node: stickyNode, type: stickyType, cached, anchor} = stickyNodeInfo;

		let stickyNodeTop: number;
		let stickyNodeHeight: number;
		let parentTop: number;
		let parentHeight: number;

		if (cached && anchor) {
			const staticRenderPos = getRelativeTop(anchor, node);
			stickyNodeTop = staticRenderPos + cached.relativeY!;
			stickyNodeHeight = cached.height!;
			parentTop = staticRenderPos + cached.parentRelativeTop!;
			parentHeight = cached.parentHeight!;
		} else {
			if (!stickyNode.yogaNode) continue;
			stickyNodeTop = getRelativeTop(stickyNode, node);
			stickyNodeHeight = stickyNode.yogaNode.getComputedHeight();

			const parent = stickyNode.parentNode!;
			if (parent?.yogaNode) {
				parentTop = getRelativeTop(parent, node);
				parentHeight = parent.yogaNode.getComputedHeight();
			} else {
				parentTop = 0;
				parentHeight = 1_000_000;
			}
		}

		const stickyNodeBottom = stickyNodeTop + stickyNodeHeight;

		if (
			stickyType === 'top' &&
			stickyNodeTop < scrollTop &&
			parentTop + parentHeight > scrollTop
		) {
			activeTopStickyNode = stickyNodeInfo;
			activeTopStickyNodeIndex = index;
		}

		if (
			stickyType === 'bottom' &&
			Math.floor(stickyNodeBottom) > Math.floor(viewportBottom) &&
			parentTop < viewportBottom
		) {
			activeBottomStickyNode = stickyNodeInfo;
			activeBottomStickyNodeIndex = index;
		}
	}

	const activeStickyNodes: Array<{
		stickyNode: DOMElement;
		type: 'top' | 'bottom';
		nextStickyNode?: DOMElement;
		nextStickyNodeInfo?: StickyNodeInfo;
		cached?: StickyHeader;
		anchor?: DOMElement;
	}> = [];

	if (activeTopStickyNode) {
		let nextStickyNode: DOMElement | undefined;
		let nextStickyNodeInfo: StickyNodeInfo | undefined;
		for (let i = activeTopStickyNodeIndex + 1; i < stickyNodes.length; i++) {
			const info = stickyNodes[i]!;
			if (info.type !== 'bottom') {
				nextStickyNode = info.node;
				nextStickyNodeInfo = info;
				break;
			}
		}

		activeStickyNodes.push({
			stickyNode: activeTopStickyNode.node,
			type: 'top',
			nextStickyNode,
			nextStickyNodeInfo,
			cached: activeTopStickyNode.cached,
			anchor: activeTopStickyNode.anchor,
		});
	}

	if (activeBottomStickyNode) {
		let nextStickyNode: DOMElement | undefined;
		let nextStickyNodeInfo: StickyNodeInfo | undefined;
		for (let i = activeBottomStickyNodeIndex - 1; i >= 0; i--) {
			const info = stickyNodes[i]!;
			if (info.type === 'bottom') {
				nextStickyNode = info.node;
				nextStickyNodeInfo = info;
				break;
			}
		}

		activeStickyNodes.push({
			stickyNode: activeBottomStickyNode.node,
			type: 'bottom',
			nextStickyNode,
			nextStickyNodeInfo,
			cached: activeBottomStickyNode.cached,
			anchor: activeBottomStickyNode.anchor,
		});
	}

	return activeStickyNodes;
}

function renderActiveStickyNodes(
	activeStickyNodes: Array<{
		stickyNode: DOMElement;
		type: 'top' | 'bottom';
		nextStickyNode?: DOMElement;
		nextStickyNodeInfo?: StickyNodeInfo;
		cached?: StickyHeader;
		anchor?: DOMElement;
	}>,
	node: DOMElement,
	output: Output,
	options: {
		x: number;
		y: number;
		newTransformers: OutputTransformer[];
		skipStaticElements: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
) {
	const {
		x,
		y,
		newTransformers,
		skipStaticElements,
		selectionMap,
		selectionStyle,
	} = options;
	const {yogaNode} = node;
	if (!yogaNode) return;

	for (const {
		stickyNode,
		type,
		nextStickyNodeInfo,
		cached,
		anchor,
	} of activeStickyNodes) {
		let stickyNodeHeight: number;
		let stickyNodeTop: number;
		let parentTop: number;
		let parentHeight: number;
		let stickyOffsetX: number;
		let stickyNodeId: number;

		const currentBorderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);
		const currentBorderLeft = yogaNode.getComputedBorder(Yoga.EDGE_LEFT);

		if (cached && anchor) {
			const staticRenderPosTop = getRelativeTop(anchor, node);
			const staticRenderPosLeft = getRelativeLeft(anchor, node);
			stickyNodeTop = staticRenderPosTop + cached.relativeY!;
			stickyNodeHeight = cached.height!;
			parentTop = staticRenderPosTop + cached.parentRelativeTop!;
			parentHeight = cached.parentHeight!;
			stickyOffsetX = x + staticRenderPosLeft + cached.relativeX!;
			stickyNodeId = cached.nodeId;
		} else {
			stickyNodeTop = getRelativeTop(stickyNode, node);
			const naturalHeight = stickyNode.yogaNode!.getComputedHeight();
			const alternateStickyNode = stickyNode.childNodes.find(
				childNode => (childNode as DOMElement).internalStickyAlternate,
			) as DOMElement | undefined;
			const stuckHeight =
				alternateStickyNode?.yogaNode?.getComputedHeight() ?? 0;
			stickyNodeHeight = Math.max(naturalHeight, stuckHeight);

			const parent = stickyNode.parentNode!;

			if (parent?.yogaNode) {
				parentTop = getRelativeTop(parent, node);
				parentHeight = parent.yogaNode.getComputedHeight();
			} else {
				parentTop = 0;
				parentHeight = 1_000_000;
			}

			stickyOffsetX = x + getRelativeLeft(stickyNode, node);
			stickyNodeId = stickyNode.internalId;
		}

		const currentScrollTop = getScrollTop(node);
		const currentClientHeight = node.internal_scrollState?.clientHeight ?? 0;

		const parentBorderBottom = cached
			? (cached.parentBorderBottom ?? 0)
			: (stickyNode.parentNode?.yogaNode?.getComputedBorder(Yoga.EDGE_BOTTOM) ??
				0);

		const parentBottom = parentTop + parentHeight - parentBorderBottom;

		let finalStickyY = 0;
		let maxStuckY: number | undefined;
		let minStuckY: number | undefined;

		if (type === 'top') {
			let maxStickyTop = y - currentScrollTop + parentBottom - stickyNodeHeight;
			const naturalStickyY = y - currentScrollTop + stickyNodeTop;
			const stuckStickyY = y + currentBorderTop;

			if (nextStickyNodeInfo) {
				let nextNodeTop: number | undefined;

				if (nextStickyNodeInfo.cached && nextStickyNodeInfo.anchor) {
					const staticRenderPosTop = getRelativeTop(
						nextStickyNodeInfo.anchor,
						node,
					);
					nextNodeTop =
						staticRenderPosTop + nextStickyNodeInfo.cached.relativeY!;
				} else if (nextStickyNodeInfo.node?.yogaNode) {
					nextNodeTop = getRelativeTop(nextStickyNodeInfo.node, node);
				}

				if (nextNodeTop !== undefined) {
					const nextNodeTopInViewport = y - currentScrollTop + nextNodeTop;

					const nextNodePushTop = nextNodeTopInViewport - stickyNodeHeight;
					if (nextNodePushTop < maxStickyTop) {
						maxStickyTop = nextNodePushTop;
					}
				}
			}

			finalStickyY = Math.min(
				Math.max(stuckStickyY, naturalStickyY),
				maxStickyTop,
			);

			maxStuckY = maxStickyTop - (y + currentBorderTop);
		} else {
			const parentBorderTop = cached
				? (cached.parentBorderTop ?? 0)
				: (stickyNode.parentNode?.yogaNode?.getComputedBorder(Yoga.EDGE_TOP) ??
					0);

			let minStickyTop = y - currentScrollTop + parentTop + parentBorderTop;
			const naturalStickyY = y - currentScrollTop + stickyNodeTop;
			const stuckStickyY =
				y + currentBorderTop + currentClientHeight - stickyNodeHeight;

			if (nextStickyNodeInfo) {
				let nextNodeHeight: number | undefined;
				let nextNodeTop: number | undefined;

				if (nextStickyNodeInfo.cached && nextStickyNodeInfo.anchor) {
					nextNodeHeight = nextStickyNodeInfo.cached.height;
					const staticRenderPosTop = getRelativeTop(
						nextStickyNodeInfo.anchor,
						node,
					);
					nextNodeTop =
						staticRenderPosTop + nextStickyNodeInfo.cached.relativeY!;
				} else if (nextStickyNodeInfo.node?.yogaNode) {
					nextNodeHeight = nextStickyNodeInfo.node.yogaNode.getComputedHeight();
					nextNodeTop = getRelativeTop(nextStickyNodeInfo.node, node);
				}

				if (nextNodeTop !== undefined && nextNodeHeight !== undefined) {
					const nextNodeBottomInViewport =
						y - currentScrollTop + nextNodeTop + nextNodeHeight;
					if (nextNodeBottomInViewport > minStickyTop) {
						minStickyTop = nextNodeBottomInViewport;
					}
				}
			}

			finalStickyY = Math.max(
				Math.min(stuckStickyY, naturalStickyY),
				minStickyTop,
			);

			minStuckY = minStickyTop - (y + currentBorderTop);
		}

		let naturalLines: StyledChar[][];
		let stuckLines: StyledChar[][] | undefined;
		let naturalHeight: number;

		if (cached) {
			naturalLines = cached.lines;
			stuckLines = cached.stuckLines;
			naturalHeight = cached.endRow - cached.startRow;
		} else {
			const rendered = renderStickyNode(stickyNode, {
				transformers: newTransformers,
				skipStaticElements,
				selectionMap,
				selectionStyle,
			});
			naturalLines = rendered.naturalLines;
			stuckLines = rendered.stuckLines;
			naturalHeight = rendered.naturalHeight;
		}

		const naturalRow = stickyNodeTop - currentBorderTop;

		const headerObj: StickyHeader = {
			nodeId: stickyNodeId,

			lines: naturalLines,

			stuckLines,

			styledOutput: stuckLines ?? naturalLines,

			x: stickyOffsetX - (x + currentBorderLeft),

			y: finalStickyY - (y + yogaNode.getComputedBorder(Yoga.EDGE_TOP)),

			naturalRow,

			startRow: naturalRow,

			endRow: naturalRow + naturalHeight,

			scrollContainerId: node.internalId,

			isStuckOnly: false,

			type,

			maxStuckY,

			minStuckY,
		};

		output.addStickyHeader(headerObj);
	}
}

function handleContainerNode(
	node: DOMElement,
	output: Output,
	options: {
		x: number;
		y: number;
		absX: number;
		absY: number;
		width: number;
		height: number;
		newTransformers: OutputTransformer[];
		skipStaticElements: boolean;
		nodesToSkip?: DOMElement[];
		isStickyRender: boolean;
		skipStickyHeaders: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
) {
	const {
		x,
		y,
		absX,
		absY,
		width,
		height,
		newTransformers,
		skipStaticElements,
		nodesToSkip,
		isStickyRender,
		skipStickyHeaders,
		selectionMap,
		selectionStyle,
	} = options;
	const {yogaNode} = node;
	if (!yogaNode) return;

	let clipped = false;
	let childrenOffsetY = y;
	let childrenOffsetX = x;
	const activeStickyNodes: Array<{
		stickyNode: DOMElement;
		type: 'top' | 'bottom';
		nextStickyNode?: DOMElement;
		nextStickyNodeInfo?: StickyNodeInfo;
		cached?: StickyHeader;
		anchor?: DOMElement;
	}> = [];

	let verticallyScrollable = false;
	let horizontallyScrollable = false;

	if (node.nodeName === 'ink-box') {
		renderBackground(x, y, node, output);
		renderBorder(x, y, node, output);

		const overflow = node.style.overflow ?? 'visible';
		const overflowX = node.style.overflowX ?? overflow;
		const overflowY = node.style.overflowY ?? overflow;

		verticallyScrollable = overflowY === 'scroll';
		horizontallyScrollable = overflowX === 'scroll';

		if (verticallyScrollable) {
			childrenOffsetY -= getScrollTop(node);

			const stickyNodes = getStickyDescendants(node);

			if (stickyNodes.length > 0) {
				const scrollTop =
					getScrollTop(node) + yogaNode.getComputedBorder(Yoga.EDGE_TOP);
				const clientHeight = node.internal_scrollState?.clientHeight ?? 0;
				const viewportBottom = scrollTop + clientHeight;

				activeStickyNodes.push(
					...identifyActiveStickyNodes(
						stickyNodes,
						node,
						scrollTop,
						viewportBottom,
					),
				);
			}
		}

		if (horizontallyScrollable) {
			childrenOffsetX -= getScrollLeft(node);
		}

		const clipHorizontally = overflowX === 'hidden' || overflowX === 'scroll';
		const clipVertically = overflowY === 'hidden' || overflowY === 'scroll';

		if (clipHorizontally || clipVertically) {
			const regionOffset = output.getRegionAbsoluteOffset();
			const x1 = clipHorizontally
				? regionOffset.x + x + yogaNode.getComputedBorder(Yoga.EDGE_LEFT)
				: undefined;

			const x2 = clipHorizontally
				? regionOffset.x +
					x +
					yogaNode.getComputedWidth() -
					yogaNode.getComputedBorder(Yoga.EDGE_RIGHT)
				: undefined;

			const y1 = clipVertically
				? regionOffset.y + y + yogaNode.getComputedBorder(Yoga.EDGE_TOP)
				: undefined;

			const y2 = clipVertically
				? regionOffset.y +
					y +
					yogaNode.getComputedHeight() -
					yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM)
				: undefined;

			if (verticallyScrollable || horizontallyScrollable) {
				const scrollHeight = getScrollHeight(node);
				const scrollWidth = getScrollWidth(node);
				const scrollTop = getScrollTop(node);
				const scrollLeft = getScrollLeft(node);

				const borderLeft = yogaNode.getComputedBorder(Yoga.EDGE_LEFT);
				const borderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);
				const borderBottom = yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);

				let marginRight = 0;
				let marginBottom = 0;

				if (!clipHorizontally) {
					marginRight = yogaNode.getComputedBorder(Yoga.EDGE_RIGHT);
				}

				if (!clipVertically) {
					marginBottom = yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);
				}

				output.startChildRegion({
					id: node.internalId,
					x: x + borderLeft,
					y: y + borderTop,
					width:
						(x2 ?? regionOffset.x + x + width) -
						(x1 ?? regionOffset.x + x + borderLeft),
					height:
						(y2 ?? regionOffset.y + y + height) -
						(y1 ?? regionOffset.y + y + borderTop),
					isScrollable: true,
					isVerticallyScrollable: verticallyScrollable,
					isHorizontallyScrollable: horizontallyScrollable,
					scrollState: {
						scrollTop,
						scrollLeft,
						scrollHeight,
						scrollWidth,
					},
					scrollbarVisible: node.internalScrollbar ?? true,
					overflowToBackbuffer: node.style.overflowToBackbuffer,
					marginRight,
					marginBottom,
					scrollbarThumbColor: node.style.scrollbarThumbColor,
					backgroundColor: node.style.backgroundColor,
					opaque: node.internalOpaque,
					nodeId: node.internalId,
					stableScrollback: node.style.stableScrollback,
					borderTop,
					borderBottom,
				});

				const childOffsetX = -borderLeft;
				const childOffsetY = -borderTop;

				const allNodesToSkip = nodesToSkip;

				for (const childNode of node.childNodes) {
					renderNodeToOutput(childNode as DOMElement, output, {
						offsetX: childOffsetX,
						offsetY: childOffsetY,
						absoluteOffsetX: absX + borderLeft - scrollLeft,
						absoluteOffsetY: absY + borderTop - scrollTop,
						transformers: newTransformers,
						skipStaticElements,
						nodesToSkip: allNodesToSkip,
						isStickyRender,
						skipStickyHeaders: false,
						selectionMap,
						selectionStyle,
					});
				}

				renderActiveStickyNodes(activeStickyNodes, node, output, {
					x,
					y,
					newTransformers,
					skipStaticElements,
					selectionMap,
					selectionStyle,
				});

				output.endChildRegion();
			}

			output.clip({
				x1,
				x2,
				y1,
				y2,
			});
			clipped = true;
		}
	}

	if (
		(node.nodeName as string) === 'ink-root' ||
		(node.nodeName as string) === 'ink-box'
	) {
		if (!(verticallyScrollable || horizontallyScrollable)) {
			const allNodesToSkip = nodesToSkip;
			for (const childNode of node.childNodes) {
				renderNodeToOutput(childNode as DOMElement, output, {
					offsetX: childrenOffsetX,
					offsetY: childrenOffsetY,
					absoluteOffsetX: absX,
					absoluteOffsetY: absY,
					transformers: newTransformers,
					skipStaticElements,
					nodesToSkip: allNodesToSkip,
					isStickyRender,
					skipStickyHeaders,
					selectionMap,
					selectionStyle,
				});
			}
		}

		if (clipped) {
			output.unclip();
		}
	}
}

// After nodes are laid out, render each to output object, which later gets rendered to terminal
function renderNodeToOutput(
	node: DOMElement,
	output: Output,
	options: {
		offsetX?: number;
		offsetY?: number;
		absoluteOffsetX?: number;
		absoluteOffsetY?: number;
		transformers?: OutputTransformer[];
		skipStaticElements: boolean;
		nodesToSkip?: DOMElement[];
		isStickyRender?: boolean;
		skipStickyHeaders?: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
) {
	if (options.nodesToSkip?.includes(node)) {
		return;
	}

	const {
		offsetX = 0,
		offsetY = 0,
		absoluteOffsetX = 0,
		absoluteOffsetY = 0,
		transformers = [],
		skipStaticElements,
		nodesToSkip,
		isStickyRender = false,
		skipStickyHeaders = false,
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

		// Absolute screen coordinates (for clipping/visibility check)
		const absX = absoluteOffsetX + yogaNode.getComputedLeft();
		const absY = absoluteOffsetY + yogaNode.getComputedTop();

		const width = yogaNode.getComputedWidth();
		const height = yogaNode.getComputedHeight();
		const clip = output.getCurrentClip();

		if (clip) {
			const absoluteNodeLeft = absX;
			const absoluteNodeRight = absoluteNodeLeft + width;
			const absoluteNodeTop = absY;
			const absoluteNodeBottom = absoluteNodeTop + height;

			const isVisible = isRectIntersectingClip(
				{
					x1: absoluteNodeLeft,
					y1: absoluteNodeTop,
					x2: absoluteNodeRight,
					y2: absoluteNodeBottom,
				},
				clip,
			);

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
			return;
		}

		if (node.cachedRender) {
			handleCachedRenderNode(node, output, {
				x,
				y,
				clip,
				newTransformers,
				selectionMap,
				selectionStyle,
			});
			return;
		}

		if (node.nodeName === 'ink-text') {
			handleTextNode(node, output, {
				x,
				y,
				newTransformers,
				selectionMap,
				selectionStyle,
			});
			return;
		}

		handleContainerNode(node, output, {
			x,
			y,
			absX,
			absY,
			width,
			height,
			newTransformers,
			skipStaticElements,
			nodesToSkip,
			isStickyRender,
			skipStickyHeaders,
			selectionMap,
			selectionStyle,
		});
	}
}

const calculateWrappedCursorPosition = (
	lines: StyledChar[][],
	styledChars: StyledChar[],
	targetOffset: number,
): {cursorLineIndex: number; relativeCursorPosition: number} => {
	const styledCharToOffset = new Map<StyledChar, number>();
	let offset = 0;

	for (const char of styledChars) {
		styledCharToOffset.set(char, offset);
		offset += char.value.length;
	}

	let cursorLineIndex = lines.length - 1;
	let relativeCursorPosition = targetOffset;
	// -1 represents "before document start" so first character (offset 0) is handled correctly
	let previousLineEndOffset = -1;

	for (const [i, line] of lines.entries()) {
		if (line.length > 0) {
			const firstChar = line.find(char => styledCharToOffset.has(char));
			const lastChar = line.findLast(char => styledCharToOffset.has(char));

			if (!firstChar || !lastChar) {
				// Padding-only line (originally empty), treat as empty line
				if (targetOffset > previousLineEndOffset) {
					cursorLineIndex = i;
					relativeCursorPosition = targetOffset - previousLineEndOffset - 1;
					previousLineEndOffset++;
				}

				continue;
			}

			const lineStartOffset = styledCharToOffset.get(firstChar)!;
			const lineEndOffset =
				styledCharToOffset.get(lastChar)! + lastChar.value.length;

			// Set as candidate if targetOffset is at or after line start
			if (targetOffset >= lineStartOffset) {
				cursorLineIndex = i;
				relativeCursorPosition = Math.max(0, targetOffset - lineStartOffset);
			}

			// Finalize and exit if targetOffset is within or before this line's range.
			// If targetOffset is in a gap (between previousLineEndOffset and lineStartOffset),
			// the cursor stays at the previous line's end (already set in previous iteration).
			if (targetOffset <= lineEndOffset) {
				break;
			}

			previousLineEndOffset = lineEndOffset;
		} else if (i === 0 && targetOffset === 0) {
			// Edge case: First line is empty and cursor is at position 0
			cursorLineIndex = 0;
			relativeCursorPosition = 0;
			break;
		} else if (i > 0 && targetOffset > previousLineEndOffset) {
			// Handle empty lines (usually caused by \n)
			cursorLineIndex = i;
			relativeCursorPosition = targetOffset - previousLineEndOffset - 1;
			// Advance past the \n character
			previousLineEndOffset++;
		}
	}

	return {cursorLineIndex, relativeCursorPosition};
};

export type StickyNodeInfo = {
	node: DOMElement;
	type: 'top' | 'bottom';
	cached?: StickyHeader;
	anchor?: DOMElement;
};

function getStickyDescendants(node: DOMElement): StickyNodeInfo[] {
	const stickyDescendants: StickyNodeInfo[] = [];

	for (const child of node.childNodes) {
		if (child.nodeName === '#text') {
			continue;
		}

		const domChild = child;

		if (domChild.internalStickyAlternate) {
			continue;
		}

		if (domChild.internalSticky) {
			stickyDescendants.push({
				node: domChild,
				type: domChild.internalSticky === 'bottom' ? 'bottom' : 'top',
			});
		} else if (
			domChild.nodeName === 'ink-static-render' &&
			domChild.cachedRender?.stickyHeaders
		) {
			for (const header of domChild.cachedRender.stickyHeaders) {
				if (header.node) {
					stickyDescendants.push({
						node: header.node,
						type: header.node.internalSticky === 'bottom' ? 'bottom' : 'top',
						cached: header,
						anchor: domChild,
					});
				}
			}
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
	if (!node.yogaNode || node === ancestor) {
		return 0;
	}

	let top = node.yogaNode.getComputedTop();
	let parent = node.parentNode;

	while (parent && parent !== ancestor) {
		if (parent.yogaNode) {
			top += parent.yogaNode.getComputedTop();
		}

		parent = parent.parentNode;
	}

	return top;
}

function getRelativeLeft(node: DOMElement, ancestor: DOMElement): number {
	if (!node.yogaNode || node === ancestor) {
		return 0;
	}

	let left = node.yogaNode.getComputedLeft();
	let parent = node.parentNode;

	while (parent && parent !== ancestor) {
		if (parent.yogaNode) {
			left += parent.yogaNode.getComputedLeft();
		}

		parent = parent.parentNode;
	}

	return left;
}

export default renderNodeToOutput;

function renderStickyNode(
	stickyNode: DOMElement,
	options: {
		transformers?: OutputTransformer[];
		skipStaticElements: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
	},
): {
	naturalLines: StyledChar[][];
	stuckLines: StyledChar[][] | undefined;
	naturalHeight: number;
	maxHeaderHeight: number;
} {
	const alternateStickyNode = stickyNode.childNodes.find(
		childNode => (childNode as DOMElement).internalStickyAlternate,
	) as DOMElement | undefined;

	const naturalHeight = stickyNode.yogaNode!.getComputedHeight();
	const stuckHeight = alternateStickyNode?.yogaNode?.getComputedHeight() ?? 0;
	const maxHeaderHeight = Math.max(naturalHeight, stuckHeight);

	const renderHeader = (isSticky: boolean) => {
		const stickyOutput = new Output({
			width: stickyNode.yogaNode!.getComputedWidth(),
			height: maxHeaderHeight,
		});

		renderNodeToOutput(stickyNode, stickyOutput, {
			offsetX: -stickyNode.yogaNode!.getComputedLeft(),
			offsetY: -stickyNode.yogaNode!.getComputedTop(),
			transformers: options.transformers,
			skipStaticElements: options.skipStaticElements,
			nodesToSkip: undefined,
			isStickyRender: isSticky,
			selectionMap: options.selectionMap,
			selectionStyle: options.selectionStyle,
		});

		return stickyOutput.get().lines;
	};

	const naturalLines = renderHeader(false);
	const stuckLines = alternateStickyNode ? renderHeader(true) : undefined;

	return {naturalLines, stuckLines, naturalHeight, maxHeaderHeight};
}
