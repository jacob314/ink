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
} from './dom.js';
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
	if (options.calculateLayout && node.yogaNode) {
		node.yogaNode.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
	}

	const width = node.yogaNode?.getComputedWidth() ?? 0;
	const height = node.yogaNode?.getComputedHeight() ?? 0;

	const stickyNodes = getStickyDescendants(node);
	const cachedStickyHeaders: StickyHeader[] = [];

	for (const {node: stickyNode} of stickyNodes) {
		const stickyYogaNode = stickyNode.yogaNode;
		if (!stickyYogaNode) {
			continue;
		}

		// Create a temporary output to render the sticky header
		const stickyOutput = new Output({
			width: stickyYogaNode.getComputedWidth(),
			height: stickyYogaNode.getComputedHeight(),
		});

		renderNodeToOutput(stickyNode, stickyOutput, {
			offsetX: -stickyYogaNode.getComputedLeft(),
			offsetY: -stickyYogaNode.getComputedTop(),
			transformers: undefined,
			skipStaticElements: options.skipStaticElements ?? false,
			nodesToSkip: undefined,
			isStickyRender: true,
			selectionMap: options.selectionMap,
			selectionStyle: options.selectionStyle,
		});

		const {lines: styledOutput} = stickyOutput.get();
		const parent = stickyNode.parentNode;
		const parentYogaNode = parent?.yogaNode;

		cachedStickyHeaders.push({
			nodeId: stickyNode.internal_id,
			node: stickyNode,
			lines: styledOutput,
			styledOutput,
			x: getRelativeLeft(stickyNode, node),
			y: getRelativeTop(stickyNode, node),
			startRow: getRelativeTop(stickyNode, node),
			endRow:
				getRelativeTop(stickyNode, node) + stickyYogaNode.getComputedHeight(),
			scrollContainerId: -1, // Will be set when rendered into a real scroll container

			relativeX: getRelativeLeft(stickyNode, node),
			relativeY: getRelativeTop(stickyNode, node),
			height: stickyYogaNode.getComputedHeight(),
			type: stickyNode.internalSticky === 'bottom' ? 'bottom' : 'top',
			parentRelativeTop: parent ? getRelativeTop(parent, node) : 0,
			parentHeight: parentYogaNode
				? parentYogaNode.getComputedHeight()
				: 1_000_000,
		});
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
			nodesToSkip: stickyNodes.map(s => s.node),
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
		stickyHeaders: cachedStickyHeaders,
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

			if (node.cachedRender.stickyHeaders && !skipStickyHeaders) {
				for (const header of node.cachedRender.stickyHeaders) {
					output.addStickyHeader({
						...header,
						x: x + header.x,
						y: y + header.y,
						startRow: y + header.startRow,
						endRow: y + header.endRow,
						// scrollContainerId remains -1 or we can try to find it.
					});
				}
			}

			return;
		}

		if (node.nodeName === 'ink-text') {
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
					const maxWidth = getMaxWidth(yogaNode);

					lines =
						currentWidth > maxWidth
							? wrapOrTruncateStyledChars(
									styledChars,
									maxWidth,
									node.style.textWrap ?? 'wrap',
								)
							: splitStyledCharsByNewline(styledChars);

					lines = applyPaddingToStyledChars(node, lines);

					// Calculate cursor line index for terminal cursor positioning
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
					// Empty text with cursor focus - use single empty line for IME support
					lines = [[]];
				}

				for (const [index, line] of lines.entries()) {
					output.write(x, y + index, line, {
						transformers: newTransformers,
						lineIndex: index,
						isTerminalCursorFocused:
							node.internal_terminalCursorFocus && index === cursorLineIndex,
						terminalCursorPosition: relativeCursorPosition,
					});
				}
			}

			return;
		}

		let clipped = false;
		let childrenOffsetY = y;
		let childrenOffsetX = x;
		const activeStickyNodes: Array<{
			stickyNode: DOMElement;
			type: 'top' | 'bottom';
			nextStickyNode?: DOMElement;
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
				childrenOffsetY -= node.internal_scrollState?.scrollTop ?? 0;

				const stickyNodes = getStickyDescendants(node);

				if (stickyNodes.length > 0) {
					const scrollTop =
						(node.internal_scrollState?.scrollTop ?? 0) +
						yogaNode.getComputedBorder(Yoga.EDGE_TOP);
					const clientHeight = node.internal_scrollState?.clientHeight ?? 0;
					const viewportBottom = scrollTop + clientHeight;

					let activeTopStickyNodeIndex = -1;
					let activeTopStickyNode: StickyNodeInfo | undefined;
					let activeBottomStickyNodeIndex = -1;
					let activeBottomStickyNode: StickyNodeInfo | undefined;

					for (const [index, stickyNodeInfo] of stickyNodes.entries()) {
						const {
							node: stickyNode,
							type: stickyType,
							cached,
							anchor,
						} = stickyNodeInfo;

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

						if (stickyType === 'top' && stickyNodeTop < scrollTop) {
							if (parentTop + parentHeight > scrollTop) {
								activeTopStickyNode = stickyNodeInfo;
								activeTopStickyNodeIndex = index;
							}
						}

						if (stickyType === 'bottom' && stickyNodeBottom > viewportBottom) {
							if (parentTop < viewportBottom) {
								activeBottomStickyNode = stickyNodeInfo;
								activeBottomStickyNodeIndex = index;
							}
						}
					}

					if (activeTopStickyNode) {
						let nextStickyNode: DOMElement | undefined;
						for (
							let i = activeTopStickyNodeIndex + 1;
							i < stickyNodes.length;
							i++
						) {
							const info = stickyNodes[i]!;
							if (info.type !== 'bottom') {
								nextStickyNode = info.node;
								break;
							}
						}

						activeStickyNodes.push({
							stickyNode: activeTopStickyNode.node,
							type: 'top',
							nextStickyNode,
							cached: activeTopStickyNode.cached,
							anchor: activeTopStickyNode.anchor,
						});
					}

					if (activeBottomStickyNode) {
						let nextStickyNode: DOMElement | undefined;
						for (let i = activeBottomStickyNodeIndex - 1; i >= 0; i--) {
							const info = stickyNodes[i]!;
							if (info.type === 'bottom') {
								nextStickyNode = info.node;
								break;
							}
						}

						activeStickyNodes.push({
							stickyNode: activeBottomStickyNode.node,
							type: 'bottom',
							nextStickyNode,
							cached: activeBottomStickyNode.cached,
							anchor: activeBottomStickyNode.anchor,
						});
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

					let marginRight = 0;
					let marginBottom = 0;

					if (!clipHorizontally) {
						marginRight = yogaNode.getComputedBorder(Yoga.EDGE_RIGHT);
					}

					if (!clipVertically) {
						marginBottom = yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM);
					}

					output.startChildRegion({
						id: node.internal_id,
						x: x1 ?? x + borderLeft,
						y: y1 ?? y + borderTop,
						width: (x2 ?? x + width) - (x1 ?? x + borderLeft),
						height: (y2 ?? y + height) - (y1 ?? y + borderTop),
						isScrollable: true,
						isVerticallyScrollable: verticallyScrollable,
						isHorizontallyScrollable: horizontallyScrollable,
						scrollState: {
							scrollTop,
							scrollLeft,
							scrollHeight,
							scrollWidth,
						},
						scrollbarVisible: node.internal_scrollbar ?? true,
						overflowToBackbuffer: node.style.overflowToBackbuffer,
						marginRight,
						marginBottom,
						scrollbarThumbColor: node.style.scrollbarThumbColor,
					});

					const childOffsetX = -borderLeft;
					const childOffsetY = -borderTop;

					const allNodesToSkip = [
						...(nodesToSkip ?? []),
						...activeStickyNodes.map(a => a.stickyNode),
					];

					for (const childNode of node.childNodes) {
						renderNodeToOutput(childNode as DOMElement, output, {
							offsetX: childOffsetX,
							offsetY: childOffsetY,
							transformers: newTransformers,
							skipStaticElements,
							nodesToSkip: allNodesToSkip,
							isStickyRender,
							skipStickyHeaders: true,
							selectionMap,
							selectionStyle,
						});
					}

										for (const {

											stickyNode,

											type,

											nextStickyNode,

											cached,

											anchor,

										} of activeStickyNodes) {

											let stickyNodeHeight: number;

											let stickyNodeTop: number;

											let parentTop: number;

											let parentHeight: number;

											let stickyOffsetX: number;

											let stickyNodeId: number;

											let nodeToRender: DOMElement | undefined;

					

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

												const alternateStickyNode = stickyNode.childNodes.find(

													childNode =>

														(childNode as DOMElement).internalStickyAlternate,

												) as DOMElement | undefined;

					

												nodeToRender = alternateStickyNode ?? stickyNode;

												const nodeToRenderYogaNode = nodeToRender.yogaNode;

					

												if (!nodeToRenderYogaNode) {

													continue;

												}

					

												stickyNodeTop = getRelativeTop(stickyNode, node);

												stickyNodeHeight = nodeToRenderYogaNode.getComputedHeight();

					

												const parent = stickyNode.parentNode!;

												if (parent?.yogaNode) {

													parentTop = getRelativeTop(parent, node);

													parentHeight = parent.yogaNode.getComputedHeight();

												} else {

													parentTop = 0;

													parentHeight = 1_000_000;

												}

					

												stickyOffsetX = x + getRelativeLeft(nodeToRender, node);

												stickyNodeId = nodeToRender.internal_id;

											}

					

						const currentBorderTop = yogaNode.getComputedBorder(Yoga.EDGE_TOP);
						const currentScrollTop = node.internal_scrollState?.scrollTop ?? 0;
						const currentClientHeight =
							node.internal_scrollState?.clientHeight ?? 0;

						const parentBottom = parentTop + parentHeight;

						let finalStickyY = 0;

						if (type === 'top') {
							const maxStickyTop =
								y - currentScrollTop + parentBottom - stickyNodeHeight;
							const naturalStickyY = y - currentScrollTop + stickyNodeTop;
							const stuckStickyY = y + currentBorderTop;

							finalStickyY = Math.min(
								Math.max(stuckStickyY, naturalStickyY),
								maxStickyTop,
							);

							if (nextStickyNode?.yogaNode) {
								const nextNodeTop = getRelativeTop(nextStickyNode, node);
								const nextNodeTopInViewport =
									y - currentScrollTop + nextNodeTop;
								if (nextNodeTopInViewport < finalStickyY + stickyNodeHeight) {
									finalStickyY = nextNodeTopInViewport - stickyNodeHeight;
								}
							}
						} else {
							// Bottom sticky
							const minStickyTop = y - currentScrollTop + parentTop;
							const naturalStickyY = y - currentScrollTop + stickyNodeTop;
							const stuckStickyY =
								y + currentBorderTop + currentClientHeight - stickyNodeHeight;

							finalStickyY = Math.max(
								Math.min(stuckStickyY, naturalStickyY),
								minStickyTop,
							);

							if (nextStickyNode?.yogaNode) {
								const nextNodeHeight =
									nextStickyNode.yogaNode.getComputedHeight();
								const nextNodeTop = getRelativeTop(nextStickyNode, node);
								const nextNodeBottomInViewport =
									y - currentScrollTop + nextNodeTop + nextNodeHeight;
								if (nextNodeBottomInViewport > finalStickyY) {
									finalStickyY = nextNodeBottomInViewport;
								}
							}
						}

												const stickyOffsetY = finalStickyY;

						

												let styledOutput: StyledChar[][];

						

												if (cached) {

													styledOutput = cached.styledOutput;

												} else {

													const nodeToRenderYogaNode = nodeToRender!.yogaNode!;

						

													// Create a temporary output to render the sticky header

													const stickyOutput = new Output({

														width: nodeToRenderYogaNode.getComputedWidth(),

														height: nodeToRenderYogaNode.getComputedHeight(),

													});

						

													renderNodeToOutput(nodeToRender!, stickyOutput, {

														offsetX: -nodeToRenderYogaNode.getComputedLeft(),

														offsetY: -nodeToRenderYogaNode.getComputedTop(),

														transformers: newTransformers,

														skipStaticElements,

														nodesToSkip: undefined,

														isStickyRender: true,

														selectionMap,

														selectionStyle,

													});

						

													styledOutput = stickyOutput.get().lines;

												}

						

												output.addStickyHeader({

													nodeId: stickyNodeId,

													node: nodeToRender,

													lines: styledOutput,

													styledOutput,

													x: stickyOffsetX - offsetX,

													y: stickyOffsetY - offsetY,

													startRow: stickyOffsetY - y, // Relative to scroll region top

													endRow: stickyOffsetY - y + stickyNodeHeight,

													scrollContainerId: node.internal_id,

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
				const allNodesToSkip = [
					...(nodesToSkip ?? []),
					...activeStickyNodes.map(a => a.stickyNode),
				];
				for (const childNode of node.childNodes) {
					renderNodeToOutput(childNode as DOMElement, output, {
						offsetX: childrenOffsetX,
						offsetY: childrenOffsetY,
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
	if (!node.yogaNode || node === ancestor) {
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
