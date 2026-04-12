import Yoga from 'yoga-layout';
import {type StyledLine} from './styled-line.js';
import {
	type DOMElement,
	type DOMNode,
	setCachedRender,
	type StickyHeader,
} from './dom.js';
import Output, {
	isRectIntersectingClip,
	extractSelectableText,
} from './output.js';
import {handleTextNode} from './render-text-node.js';
import {renderStickyNode, getStickyDescendants} from './render-sticky.js';
import {handleContainerNode} from './render-container.js';
import {handleCachedRenderNode} from './render-cached.js';
import {getRelativeLeft, getRelativeTop} from './measure-element.js';
import {triggerResizeObservers} from './resize-observer.js';

export type OutputTransformer = (s: string, index: number) => string;

export const renderToStatic = (
	node: DOMElement,
	options: {
		calculateLayout?: boolean;
		skipStaticElements?: boolean;
		isStickyRender?: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (line: StyledLine, index: number) => void;
		trackSelection?: boolean;
	} = {},
) => {
	if (options.calculateLayout && node.yogaNode) {
		node.yogaNode.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
	}

	// Cache dimensions of the static tree before we render it out and cache/destroy its Yoga children
	triggerResizeObservers(node, true);

	const width = Math.round(node.yogaNode?.getComputedWidth() ?? 0);
	const height = Math.round(node.yogaNode?.getComputedHeight() ?? 0);

	const stickyNodes = getStickyDescendants(node);
	const cachedStickyHeaders: StickyHeader[] = [];

	for (const stickyNodeInfo of stickyNodes) {
		const {node: stickyNode, type: stickyType, cached, anchor} = stickyNodeInfo;

		let naturalLines;
		let stuckLines;
		let naturalHeight;
		let maxHeaderHeight;

		let relativeX: number;
		let relativeY: number;
		let parentRelativeTop: number;
		let parentHeight: number;
		let parentBorderTop: number;
		let parentBorderBottom: number;
		let nodeId: number;

		const currentBorderTop =
			node.yogaNode?.getComputedBorder(Yoga.EDGE_TOP) ?? 0;
		const currentBorderLeft =
			node.yogaNode?.getComputedBorder(Yoga.EDGE_LEFT) ?? 0;

		if (cached && anchor) {
			naturalLines = cached.lines;
			stuckLines = cached.stuckLines;
			naturalHeight = cached.endRow - cached.startRow;
			maxHeaderHeight = cached.height!;

			const staticRenderPosTop = getRelativeTop(anchor, node) ?? 0;
			const staticRenderPosLeft = getRelativeLeft(anchor, node) ?? 0;

			relativeX = staticRenderPosLeft + cached.relativeX!;
			relativeY = staticRenderPosTop + cached.relativeY!;
			parentRelativeTop = staticRenderPosTop + cached.parentRelativeTop!;
			parentHeight = cached.parentHeight!;
			parentBorderTop = cached.parentBorderTop!;
			parentBorderBottom = cached.parentBorderBottom!;
			nodeId = cached.nodeId;
		} else {
			if (!stickyNode) continue;
			const rendered = renderStickyNode(stickyNode, {
				skipStaticElements: options.skipStaticElements ?? false,
				selectionMap: options.selectionMap,
				selectionStyle: options.selectionStyle,
				trackSelection: options.trackSelection,
			});
			naturalLines = rendered.naturalLines;
			stuckLines = rendered.stuckLines;
			naturalHeight = rendered.naturalHeight;
			maxHeaderHeight = rendered.maxHeaderHeight;

			relativeX = (getRelativeLeft(stickyNode, node) ?? 0) - currentBorderLeft;
			relativeY = (getRelativeTop(stickyNode, node) ?? 0) - currentBorderTop;

			const parent = stickyNode.parentNode;
			const parentYogaNode = parent?.yogaNode;
			parentRelativeTop = parent
				? (getRelativeTop(parent, node) ?? 0) - currentBorderTop
				: 0;
			parentHeight = parentYogaNode
				? Math.round(parentYogaNode.getComputedHeight())
				: Number.MAX_SAFE_INTEGER;
			parentBorderTop = parentYogaNode
				? parentYogaNode.getComputedBorder(Yoga.EDGE_TOP)
				: 0;
			parentBorderBottom = parentYogaNode
				? parentYogaNode.getComputedBorder(Yoga.EDGE_BOTTOM)
				: 0;
			nodeId = stickyNode.internalId;
		}

		const naturalRow = relativeY;

		const headerObj: StickyHeader = {
			nodeId,
			lines: naturalLines,
			stuckLines,
			styledOutput: stuckLines ?? naturalLines,
			x: relativeX,
			y: relativeY,
			naturalRow,
			startRow: naturalRow,
			endRow: naturalRow + naturalHeight,
			scrollContainerId: -1,
			isStuckOnly: true,

			relativeX,
			relativeY,
			height: maxHeaderHeight,
			type: stickyType,
			parentRelativeTop,
			parentHeight,
			parentBorderTop,
			parentBorderBottom,
			node: undefined,
		};

		cachedStickyHeaders.push(headerObj);
	}

	const staticOutput = new Output({
		width,
		height,
		id: node.internalId,
		trackSelection: options.trackSelection,
	});

	for (const childNode of node.childNodes) {
		renderNodeToOutput(childNode as DOMElement, staticOutput, {
			offsetX: 0,
			offsetY: 0,
			transformers: undefined,
			skipStaticElements: options.skipStaticElements ?? false,
			isStickyRender: options.isStickyRender,
			selectionMap: options.selectionMap,
			selectionStyle: options.selectionStyle,
			trackSelection: options.trackSelection,
		});
	}

	const rootRegion = staticOutput.get();
	rootRegion.cachedStickyHeaders = cachedStickyHeaders;
	if (options.trackSelection) {
		rootRegion.selectableText = extractSelectableText(
			rootRegion.selectableSpans,
		);
	}

	setCachedRender(node, rootRegion);
	if (node.internal_onRendered) {
		node.internal_onRendered();
	}
};

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
		isStickyRender?: boolean;
		skipStickyHeaders?: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (line: StyledLine, index: number) => void;
		trackSelection?: boolean;
	},
) {
	const {
		offsetX = 0,
		offsetY = 0,
		absoluteOffsetX = 0,
		absoluteOffsetY = 0,
		transformers = [],
		skipStaticElements,
		isStickyRender = false,
		skipStickyHeaders = false,
		selectionMap,
		selectionStyle,
		trackSelection,
	} = options;

	if (skipStaticElements && node.internal_static) {
		return;
	}

	if (node.internalStickyAlternate && !isStickyRender) {
		return;
	}

	const {yogaNode} = node;

	if (yogaNode) {
		let display: number;
		let computedLeft: number;
		let computedTop: number;
		let width: number;
		let height: number;

		const hasNewLayout = yogaNode.hasNewLayout();

		if (!hasNewLayout && node.cachedLayout) {
			display = node.cachedLayout.display;
			computedLeft = node.cachedLayout.computedLeft;
			computedTop = node.cachedLayout.computedTop;
			width = node.cachedLayout.width;
			height = node.cachedLayout.height;
		} else {
			display = yogaNode.getDisplay();
			computedLeft = yogaNode.getComputedLeft();
			computedTop = yogaNode.getComputedTop();
			width = Math.round(yogaNode.getComputedWidth());
			height = Math.round(yogaNode.getComputedHeight());
		}

		const layoutUnchanged =
			node.cachedLayout &&
			node.cachedLayout.display === display &&
			node.cachedLayout.computedLeft === computedLeft &&
			node.cachedLayout.computedTop === computedTop &&
			node.cachedLayout.width === width &&
			node.cachedLayout.height === height;

		if (hasNewLayout) {
			node.cachedLayout = {
				display,
				computedLeft,
				computedTop,
				width,
				height,
			};
		}

		const canSkip =
			!isStickyRender &&
			!node.isDirty &&
			(!hasNewLayout || layoutUnchanged);

		if (display === Yoga.DISPLAY_NONE) {
			if (hasNewLayout) {
				yogaNode.markLayoutSeen();
			}
			return;
		}

		// Left and top positions in Yoga are relative to their parent node
		const x = Math.round(offsetX + computedLeft);
		const y = Math.round(offsetY + computedTop);

		// Absolute screen coordinates (for clipping/visibility check)
		const absX = Math.round(absoluteOffsetX + computedLeft);
		const absY = Math.round(absoluteOffsetY + computedTop);

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
				if (hasNewLayout) {
					yogaNode.markLayoutSeen();
				}
				return;
			}
		}

		if (canSkip && node.cachedOutputCapture) {
			output.replayCapture(node.cachedOutputCapture, absX, absY);
			return;
		}

		let isCapturing = false;
		if (!isStickyRender && !node.isDirty && (!hasNewLayout || layoutUnchanged)) {
			output.startCapture(absX, absY);
			isCapturing = true;
		}

		const finalizeNode = () => {
			if (isCapturing) {
				const capture = output.endCapture();
				if (capture) {
					node.cachedOutputCapture = capture;
				} else {
					node.cachedOutputCapture = undefined;
				}
			}
			if (hasNewLayout) {
				yogaNode.markLayoutSeen();
			}
			node.isDirty = false;
		};

		// Transformers are functions that transform final text output of each component
		// See Output class for logic that applies transformers
		let newTransformers = transformers;
		if (typeof node.internal_transform === 'function') {
			newTransformers = [node.internal_transform, ...transformers];
		}

		if (node.nodeName === 'ink-static-render' && !node.cachedRender) {
			finalizeNode();
			return;
		}

		if (node.cachedRender) {
			handleCachedRenderNode(node, output, {
				x,
				y,
				selectionMap,
				selectionStyle,
				trackSelection,
			});
			finalizeNode();
			return;
		}

		if (node.nodeName === 'ink-text') {
			handleTextNode(node, output, {
				x,
				y,
				newTransformers,
				selectionMap,
				selectionStyle,
				trackSelection,
			});
			finalizeNode();
			return;
		}

		handleContainerNode(node, output, {
			x,
			y,
			width,
			height,
			newTransformers,
			skipStaticElements,
			isStickyRender,
			skipStickyHeaders,
			selectionMap,
			selectionStyle,
			absoluteOffsetX: absX,
			absoluteOffsetY: absY,
			trackSelection,
		});
		
		finalizeNode();
	}
}

export default renderNodeToOutput;
