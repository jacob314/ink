import {type StyledLine} from './styled-line.js';
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Yoga from 'yoga-layout';
import {type DOMElement, type DOMNode, type StickyHeader} from './dom.js';
import Output from './output.js';
import renderNodeToOutput, {
	type OutputTransformer,
} from './render-node-to-output.js';
import {getScrollTop} from './scroll.js';
import {getRelativeTop, getRelativeLeft} from './measure-element.js';

export type StickyNodeInfo = {
	node?: DOMElement;
	type: 'top' | 'bottom';
	cached?: StickyHeader;
	anchor?: DOMElement;
};

export type ResolvedStickyHeaderInfo = {
	stickyNodeTop: number;
	stickyNodeHeight: number;
	naturalStickyNodeHeight: number;
	parentRelativeTop: number;
	parentHeight: number;
	parentBorderTop: number;
	parentBorderBottom: number;
	relativeX: number;
	relativeY: number;
	nodeId: number;
};

export function resolveStickyHeaderInfo(
	stickyNodeInfo: StickyNodeInfo,
	node: DOMElement,
): ResolvedStickyHeaderInfo {
	const {node: stickyNode, cached, anchor} = stickyNodeInfo;

	let stickyNodeTop: number;
	let stickyNodeHeight: number;
	let naturalStickyNodeHeight: number;
	let parentRelativeTop: number;
	let parentHeight: number;
	let parentBorderTop: number;
	let parentBorderBottom: number;
	let relativeX: number;
	let relativeY: number;
	let nodeId: number;

	const currentBorderTop = node.yogaNode?.getComputedBorder(Yoga.EDGE_TOP) ?? 0;
	const currentBorderLeft =
		node.yogaNode?.getComputedBorder(Yoga.EDGE_LEFT) ?? 0;

	if (cached && anchor) {
		const staticRenderPosTop = getRelativeTop(anchor, node) ?? 0;
		const staticRenderPosLeft = getRelativeLeft(anchor, node) ?? 0;

		const anchorBorderTop =
			anchor.yogaNode?.getComputedBorder(Yoga.EDGE_TOP) ?? 0;
		const anchorBorderLeft =
			anchor.yogaNode?.getComputedBorder(Yoga.EDGE_LEFT) ?? 0;

		stickyNodeTop =
			staticRenderPosTop + anchorBorderTop + (cached.relativeY ?? 0);
		stickyNodeHeight = cached.height!;
		naturalStickyNodeHeight = cached.endRow - cached.startRow;
		parentRelativeTop =
			staticRenderPosTop + anchorBorderTop + (cached.parentRelativeTop ?? 0);
		parentHeight = cached.parentHeight!;
		parentBorderTop = cached.parentBorderTop ?? 0;
		parentBorderBottom = cached.parentBorderBottom ?? 0;
		relativeX =
			staticRenderPosLeft +
			anchorBorderLeft +
			(cached.relativeX ?? 0) -
			currentBorderLeft;
		relativeY = stickyNodeTop - currentBorderTop;
		nodeId = cached.nodeId;
	} else if (stickyNode) {
		stickyNodeTop = getRelativeTop(stickyNode, node) ?? 0;
		naturalStickyNodeHeight = Math.round(
			stickyNode.yogaNode?.getComputedHeight() ?? 0,
		);
		const alternateStickyNode = stickyNode.childNodes.find(
			childNode => (childNode as DOMElement).internalStickyAlternate,
		) as DOMElement | undefined;
		const stuckHeight = Math.round(
			alternateStickyNode?.yogaNode?.getComputedHeight() ?? 0,
		);
		stickyNodeHeight = Math.max(naturalStickyNodeHeight, stuckHeight);

		const parent = stickyNode.parentNode;
		const parentYogaNode = parent?.yogaNode;
		if (parentYogaNode) {
			parentRelativeTop = getRelativeTop(parent, node) ?? 0;
			parentHeight = Math.round(parentYogaNode.getComputedHeight());
			parentBorderTop = parentYogaNode.getComputedBorder(Yoga.EDGE_TOP);
			parentBorderBottom = parentYogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);
		} else {
			parentRelativeTop = 0;
			parentHeight = Number.MAX_SAFE_INTEGER;
			parentBorderTop = 0;
			parentBorderBottom = 0;
		}

		relativeX = (getRelativeLeft(stickyNode, node) ?? 0) - currentBorderLeft;
		relativeY = stickyNodeTop - currentBorderTop;
		nodeId = stickyNode.internalId;
	} else {
		throw new Error(
			'stickyNodeInfo must have a node if not using cached headers',
		);
	}

	return {
		stickyNodeTop,
		stickyNodeHeight,
		naturalStickyNodeHeight,
		parentRelativeTop,
		parentHeight,
		parentBorderTop,
		parentBorderBottom,
		relativeX,
		relativeY,
		nodeId,
	};
}

export function getStickyDescendants(node: DOMElement): StickyNodeInfo[] {
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
			domChild.cachedRender?.cachedStickyHeaders
		) {
			for (const header of domChild.cachedRender.cachedStickyHeaders) {
				stickyDescendants.push({
					type: header.type ?? 'top',
					cached: header,
					anchor: domChild,
				});
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

export function renderStickyNode(
	stickyNode: DOMElement,
	options: {
		transformers?: OutputTransformer[];
		skipStaticElements: boolean;
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (line: StyledLine, index: number) => void;
		trackSelection?: boolean;
	},
): {
	naturalLines: readonly StyledLine[];
	stuckLines: readonly StyledLine[] | undefined;
	naturalHeight: number;
	maxHeaderHeight: number;
} {
	const alternateStickyNode = stickyNode.childNodes.find(
		childNode => (childNode as DOMElement).internalStickyAlternate,
	) as DOMElement | undefined;

	const naturalHeight = Math.round(stickyNode.yogaNode!.getComputedHeight());
	const stuckHeight = Math.round(
		alternateStickyNode?.yogaNode?.getComputedHeight() ?? 0,
	);
	const maxHeaderHeight = Math.max(naturalHeight, stuckHeight);

	const renderHeader = (isSticky: boolean) => {
		const stickyOutput = new Output({
			width: stickyNode.yogaNode!.getComputedWidth(),
			height: maxHeaderHeight,
			trackSelection: options.trackSelection,
		});

		renderNodeToOutput(stickyNode, stickyOutput, {
			offsetX: -stickyNode.yogaNode!.getComputedLeft(),
			offsetY: -stickyNode.yogaNode!.getComputedTop(),
			transformers: options.transformers,
			skipStaticElements: options.skipStaticElements,
			isStickyRender: isSticky,
			selectionMap: options.selectionMap,
			selectionStyle: options.selectionStyle,
			trackSelection: options.trackSelection,
		});

		return stickyOutput.get().lines;
	};

	const naturalLines = renderHeader(false);
	const stuckLines = alternateStickyNode ? renderHeader(true) : undefined;

	return {naturalLines, stuckLines, naturalHeight, maxHeaderHeight};
}

export function identifyActiveStickyNodes(
	stickyNodes: StickyNodeInfo[],
	node: DOMElement,
	scrollTop: number,
	viewportBottom: number,
	stickyHeadersInBackbuffer?: boolean,
) {
	const activeStickyNodes: Array<{
		stickyNode?: DOMElement;
		type: 'top' | 'bottom';
		nextStickyNode?: DOMElement;
		nextStickyNodeInfo?: StickyNodeInfo;
		cached?: StickyHeader;
		anchor?: DOMElement;
		originalIndex: number;
	}> = [];

	let lastActiveTopIndex = -1;
	let lastActiveBottomIndex = -1;

	for (const [index, stickyNodeInfo] of stickyNodes.entries()) {
		const {type: stickyType} = stickyNodeInfo;

		const {
			stickyNodeTop,
			naturalStickyNodeHeight,
			parentRelativeTop,
			parentHeight,
		} = resolveStickyHeaderInfo(stickyNodeInfo, node);

		const stickyNodeBottom = stickyNodeTop + naturalStickyNodeHeight;

		if (
			stickyType === 'top' &&
			(stickyHeadersInBackbuffer ||
				(stickyNodeTop < scrollTop &&
					parentRelativeTop + parentHeight > scrollTop))
		) {
			lastActiveTopIndex = index;
			if (stickyHeadersInBackbuffer) {
				// In backbuffer mode, we want to track ALL of them
				activeStickyNodes.push({
					stickyNode: stickyNodeInfo.node,
					type: 'top',
					cached: stickyNodeInfo.cached,
					anchor: stickyNodeInfo.anchor,
					originalIndex: index,
				});
			}
		}

		if (
			stickyType === 'bottom' &&
			(stickyHeadersInBackbuffer ||
				(Math.floor(stickyNodeBottom) > Math.floor(viewportBottom) &&
					parentRelativeTop < viewportBottom))
		) {
			lastActiveBottomIndex = index;
			if (stickyHeadersInBackbuffer) {
				activeStickyNodes.push({
					stickyNode: stickyNodeInfo.node,
					type: 'bottom',
					cached: stickyNodeInfo.cached,
					anchor: stickyNodeInfo.anchor,
					originalIndex: index,
				});
			}
		}
	}

	const findNextStickyNode = (
		startIndex: number,
		direction: 'forward' | 'backward',
	) => {
		const step = direction === 'forward' ? 1 : -1;
		const endCondition =
			direction === 'forward'
				? (i: number) => i < stickyNodes.length
				: (i: number) => i >= 0;
		const targetType = direction === 'forward' ? 'top' : 'bottom';

		for (let i = startIndex + step; endCondition(i); i += step) {
			const info = stickyNodes[i]!;
			// Top sticky headers block other top sticky headers.
			// Bottom sticky headers block other bottom sticky headers.
			if (info.type === targetType) {
				return info;
			}
		}

		return undefined;
	};

	if (stickyHeadersInBackbuffer) {
		// When stickyHeadersInBackbuffer is ON, we need to populate nextStickyNodeInfo for ALL of them
		for (const active of activeStickyNodes) {
			const info = findNextStickyNode(
				active.originalIndex,
				active.type === 'top' ? 'forward' : 'backward',
			);
			if (info) {
				active.nextStickyNode = info.node;
				active.nextStickyNodeInfo = info;
			}
		}
	} else {
		if (lastActiveTopIndex !== -1) {
			const activeTopStickyNode = stickyNodes[lastActiveTopIndex]!;
			const info = findNextStickyNode(lastActiveTopIndex, 'forward');

			activeStickyNodes.push({
				stickyNode: activeTopStickyNode.node,
				type: 'top',
				nextStickyNode: info?.node,
				nextStickyNodeInfo: info,
				cached: activeTopStickyNode.cached,
				anchor: activeTopStickyNode.anchor,
				originalIndex: lastActiveTopIndex,
			});
		}

		if (lastActiveBottomIndex !== -1) {
			const activeBottomStickyNode = stickyNodes[lastActiveBottomIndex]!;
			const info = findNextStickyNode(lastActiveBottomIndex, 'backward');

			activeStickyNodes.push({
				stickyNode: activeBottomStickyNode.node,
				type: 'bottom',
				nextStickyNode: info?.node,
				nextStickyNodeInfo: info,
				cached: activeBottomStickyNode.cached,
				anchor: activeBottomStickyNode.anchor,
				originalIndex: lastActiveBottomIndex,
			});
		}
	}

	return activeStickyNodes;
}

export function renderActiveStickyNodes(
	activeStickyNodes: Array<{
		stickyNode?: DOMElement;
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
		selectionStyle?: (line: StyledLine, index: number) => void;
		trackSelection?: boolean;
		stickyHeadersInBackbuffer?: boolean;
	},
) {
	const {
		y,
		newTransformers,
		skipStaticElements,
		selectionMap,
		selectionStyle,
		trackSelection,
		stickyHeadersInBackbuffer,
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
		const currentBorderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);

		const stickyNodeInfo: StickyNodeInfo = {
			node: stickyNode,
			type,
			cached,
			anchor,
		};

		const {
			stickyNodeTop,
			stickyNodeHeight,
			parentRelativeTop,
			parentHeight,
			parentBorderTop,
			parentBorderBottom,
			relativeX,
			relativeY: _relativeY,
			nodeId: stickyNodeId,
		} = resolveStickyHeaderInfo(stickyNodeInfo, node);

		const currentScrollTop = getScrollTop(node);
		const currentClientHeight = node.internal_scrollState?.clientHeight ?? 0;

		const parentBottom = parentRelativeTop + parentHeight - parentBorderBottom;

		let finalStickyY = 0;
		let maxStuckY: number | undefined;
		let minStuckY: number | undefined;

		if (type === 'top') {
			let maxStickyTop = y - currentScrollTop + parentBottom - stickyNodeHeight;
			const naturalStickyY = y - currentScrollTop + stickyNodeTop;
			const stuckStickyY = y + currentBorderTop;

			if (nextStickyNodeInfo && !stickyHeadersInBackbuffer) {
				let nextNodeTop: number | undefined;

				if (nextStickyNodeInfo.cached && nextStickyNodeInfo.anchor) {
					const staticRenderPosTop =
						getRelativeTop(nextStickyNodeInfo.anchor, node) ?? 0;
					nextNodeTop =
						staticRenderPosTop + nextStickyNodeInfo.cached.relativeY!;
				} else if (nextStickyNodeInfo.node?.yogaNode) {
					nextNodeTop = getRelativeTop(nextStickyNodeInfo.node, node) ?? 0;
				}

				if (nextNodeTop !== undefined) {
					const nextNodeTopInViewport = y - currentScrollTop + nextNodeTop;

					const nextNodePushTop = nextNodeTopInViewport - stickyNodeHeight;
					if (nextNodePushTop < maxStickyTop) {
						maxStickyTop = nextNodePushTop;
					}
				}
			}

			finalStickyY = stickyHeadersInBackbuffer
				? Math.min(stuckStickyY, maxStickyTop)
				: Math.min(Math.max(stuckStickyY, naturalStickyY), maxStickyTop);

			maxStuckY = maxStickyTop - (y + currentBorderTop);
		} else {
			let minStickyTop =
				y - currentScrollTop + parentRelativeTop + parentBorderTop;

			if (stickyHeadersInBackbuffer) {
				minStickyTop = Number.MIN_SAFE_INTEGER;
			}

			const naturalStickyY = y - currentScrollTop + stickyNodeTop;
			const stuckStickyY =
				y + currentBorderTop + currentClientHeight - stickyNodeHeight;

			if (nextStickyNodeInfo && !stickyHeadersInBackbuffer) {
				let nextNodeHeight: number | undefined;
				let nextNodeTop: number | undefined;

				if (nextStickyNodeInfo.cached && nextStickyNodeInfo.anchor) {
					nextNodeHeight = nextStickyNodeInfo.cached.height;
					const staticRenderPosTop =
						getRelativeTop(nextStickyNodeInfo.anchor, node) ?? 0;
					nextNodeTop =
						staticRenderPosTop + nextStickyNodeInfo.cached.relativeY!;
				} else if (nextStickyNodeInfo.node?.yogaNode) {
					nextNodeHeight = Math.round(
						nextStickyNodeInfo.node.yogaNode.getComputedHeight(),
					);
					nextNodeTop = getRelativeTop(nextStickyNodeInfo.node, node) ?? 0;
				}

				if (nextNodeTop !== undefined && nextNodeHeight !== undefined) {
					const nextNodeBottomInViewport =
						y - currentScrollTop + nextNodeTop + nextNodeHeight;
					if (nextNodeBottomInViewport > minStickyTop) {
						minStickyTop = nextNodeBottomInViewport;
					}
				}
			}

			finalStickyY = stickyHeadersInBackbuffer
				? Math.max(stuckStickyY, minStickyTop)
				: Math.max(Math.min(stuckStickyY, naturalStickyY), minStickyTop);
			minStuckY = minStickyTop - (y + currentBorderTop);
		}

		let naturalLines: readonly StyledLine[];
		let stuckLines: readonly StyledLine[] | undefined;
		let naturalHeight: number;

		if (cached) {
			naturalLines = cached.lines;
			stuckLines = cached.stuckLines;
			naturalHeight = cached.endRow - cached.startRow;
		} else {
			const rendered = renderStickyNode(stickyNode!, {
				transformers: newTransformers,
				skipStaticElements,
				selectionMap,
				selectionStyle,
				trackSelection,
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
			x: relativeX,
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
