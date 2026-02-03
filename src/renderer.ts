import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import {calculateScrollbarThumb} from './measure-element.js';
import renderNodeToOutput, {
	renderNodeToScreenReaderOutput,
} from './render-node-to-output.js';
import Output, {type Region} from './output.js';
import {
	type DOMElement,
	type DOMNode,
	isNodeSelectable,
	type StickyHeader,
} from './dom.js';
import {type Selection} from './selection.js';
import {renderScrollbar} from './render-scrollbar.js';

type Result = {
	output: string;
	outputHeight: number;
	staticOutput: string;
	styledOutput: StyledChar[][];
	cursorPosition?: {row: number; col: number};
	backbufferContent: StyledChar[][];
	stickyHeaders: StickyHeader[];
	root?: Region;
};

const calculateSelectionMap = (
	root: DOMElement,
	selection: Selection,
): Map<DOMNode, {start: number; end: number}> => {
	const map = new Map<DOMNode, {start: number; end: number}>();

	if (selection.rangeCount === 0) {
		return map;
	}

	const range = selection.getRangeAt(0);
	const {startContainer, startOffset, endContainer, endOffset} = range;

	let hasFoundStart = false;
	let hasFoundEnd = false;

	const visit = (node: DOMNode) => {
		if (node.nodeName === 'ink-text') {
			if (!isNodeSelectable(node)) {
				return;
			}

			let localLength = 0;
			let nodeStartIndex = -1;
			let nodeEndIndex = -1;
			let foundStartInNode = false;
			let foundEndInNode = false;

			const visitChildren = (n: DOMNode) => {
				if (n.nodeName === '#text') {
					const {length} = n.nodeValue;

					if (startContainer === n) {
						foundStartInNode = true;
						nodeStartIndex = localLength + startOffset;
					}

					if (endContainer === n) {
						foundEndInNode = true;
						nodeEndIndex = localLength + endOffset;
					}

					localLength += length;
				} else {
					const {childNodes} = n;
					if (childNodes) {
						for (const child of childNodes) {
							if (n === startContainer) {
								foundStartInNode = true;
								nodeStartIndex = localLength;
							}

							if (n === endContainer) {
								foundEndInNode = true;
								nodeEndIndex = localLength;
							}

							if (child) {
								visitChildren(child);
							}
						}

						if (n === startContainer && startOffset === childNodes.length) {
							foundStartInNode = true;
							nodeStartIndex = localLength;
						}

						if (n === endContainer && endOffset === childNodes.length) {
							foundEndInNode = true;
							nodeEndIndex = localLength;
						}
					}
				}
			};

			const {childNodes} = node;
			if (childNodes) {
				for (const child of childNodes) {
					if (node === startContainer) {
						foundStartInNode = true;
						nodeStartIndex = localLength;
					}

					if (node === endContainer) {
						foundEndInNode = true;
						nodeEndIndex = localLength;
					}

					if (child) {
						visitChildren(child);
					}
				}

				if (node === startContainer && startOffset === childNodes.length) {
					foundStartInNode = true;
					nodeStartIndex = localLength;
				}

				if (node === endContainer && endOffset === childNodes.length) {
					foundEndInNode = true;
					nodeEndIndex = localLength;
				}
			}

			if (
				(hasFoundStart || foundStartInNode) &&
				(!hasFoundEnd || foundEndInNode)
			) {
				const start = foundStartInNode ? nodeStartIndex : 0;
				const end = foundEndInNode ? nodeEndIndex : localLength;

				if (start !== -1 && end !== -1 && start < end) {
					map.set(node, {start, end});
				}
			}

			if (foundStartInNode) {
				hasFoundStart = true;
			}

			if (foundEndInNode) {
				hasFoundEnd = true;
			}
		} else {
			const {childNodes} = node as DOMElement;
			if (childNodes) {
				for (const child of childNodes) {
					if (node === startContainer) {
						hasFoundStart = true;
					}

					if (node === endContainer) {
						hasFoundEnd = true;
					}

					if (child) {
						visit(child);
					}
				}

				if (node === startContainer && startOffset === childNodes.length) {
					hasFoundStart = true;
				}

				if (node === endContainer && endOffset === childNodes.length) {
					hasFoundEnd = true;
				}
			}
		}
	};

	visit(root);

	return map;
};

const renderer = (
	node: DOMElement,
	options: {
		isScreenReaderEnabled: boolean;
		selection?: Selection;
		selectionStyle?: (char: StyledChar) => StyledChar;
		skipScrollbars?: boolean;
	},
): Result => {
	const {isScreenReaderEnabled, selection, selectionStyle, skipScrollbars} =
		options;

	if (node.yogaNode) {
		if (isScreenReaderEnabled) {
			const output = renderNodeToScreenReaderOutput(node, {
				skipStaticElements: true,
			});

			const outputHeight = output === '' ? 0 : output.split('\n').length;

			let staticOutput = '';

			if (node.staticNode) {
				staticOutput = renderNodeToScreenReaderOutput(node.staticNode, {
					skipStaticElements: false,
				});
			}

			return {
				output,
				outputHeight,
				staticOutput: staticOutput ? `${staticOutput}\n` : '',
				styledOutput: [],
				backbufferContent: [],
				stickyHeaders: [],
			};
		}

		const output = new Output({
			width: node.yogaNode.getComputedWidth(),
			height: node.yogaNode.getComputedHeight(),
		});

		const selectionMap = selection
			? calculateSelectionMap(node, selection)
			: undefined;

		renderNodeToOutput(node, output, {
			skipStaticElements: true,
			selectionStyle,
			selectionMap,
			nodesToSkip: undefined,
		});

		let staticOutput;

		if (node.staticNode?.yogaNode) {
			staticOutput = new Output({
				width: node.staticNode.yogaNode.getComputedWidth(),
				height: node.staticNode.yogaNode.getComputedHeight(),
			});

			renderNodeToOutput(node.staticNode, staticOutput, {
				skipStaticElements: false,
				selectionStyle,
				selectionMap: selection
					? calculateSelectionMap(node.staticNode, selection)
					: undefined,
				nodesToSkip: undefined,
			});
		}

		const rootRegion = output.get();

		const {
			output: generatedOutput,
			height: outputHeight,
			styledOutput,
			cursorPosition,
		} = regionToOutput(rootRegion, {skipScrollbars});

		return {
			output: generatedOutput,
			outputHeight,
			// Newline at the end is needed, because static output doesn't have one, so
			// interactive output will override last line of static output
			// staticOutput has .lines now.
			staticOutput: staticOutput
				? `${regionToOutput(staticOutput.get()).output}\n`
				: '',
			styledOutput,
			cursorPosition,
			backbufferContent: [], // Backbuffer not supported in region tree yet? Or attached to root?
			// rootRegion has 'lines'.
			// styledOutput is rootRegion.lines? No, lines is StyledChar[][].
			// We need to flatten if we want to support legacy return.
			// For now, let's just use rootRegion.lines as styledOutput.
			// scrollRegions: [], // Derived from tree
			stickyHeaders: [], // Derived from tree
			root: rootRegion,
		};
	}

	return {
		output: '',
		outputHeight: 0,
		staticOutput: '',
		styledOutput: [],
		backbufferContent: [],
		stickyHeaders: [],
		root: undefined,
	};
};

function regionToOutput(
	region: Region,
	options?: {
		skipScrollbars?: boolean;
	},
) {
	const context: {cursorPosition?: {row: number; col: number}} = {};
	const lines = flattenRegion(region, {context, ...options});

	if (context.cursorPosition) {
		const {row, col} = context.cursorPosition;
		const line = lines[row];

		if (line) {
			let currentLineCol = 0;
			let lastContentCol = 0;

			for (const char of line) {
				const charWidth = char.fullWidth ? 2 : 1;

				if (char.value !== ' ' || char.styles.length > 0) {
					lastContentCol = currentLineCol + charWidth;
				}

				currentLineCol += charWidth;
			}

			if (col > lastContentCol) {
				context.cursorPosition.col = lastContentCol;
			}
		}
	}

	// Flatten the root region for legacy string output
	const generatedOutput = lines
		.map(line => {
			const lineWithoutEmptyItems = line.filter(item => item !== undefined);
			return styledCharsToString(lineWithoutEmptyItems).trimEnd();
		})
		.join('\n');

	return {
		output: generatedOutput,
		height: lines.length,
		styledOutput: lines,
		cursorPosition: context.cursorPosition,
	};
}

export function flattenRegion(
	root: Region,
	options?: {
		context?: {cursorPosition?: {row: number; col: number}};
		skipScrollbars?: boolean;
	},
): StyledChar[][] {
	const {width, height} = root;

	const lines: StyledChar[][] = Array.from({length: height}, () =>
		Array.from({length: width}, () => ({
			type: 'char',
			value: ' ',
			fullWidth: false,
			styles: [],
		})),
	);

	composeRegion(
		root,
		lines,
		{
			clip: {x: 0, y: 0, w: width, h: height},
		},
		options,
	);
	return lines;
}

function composeRegion(
	region: Region,
	targetLines: StyledChar[][],
	{
		clip,
		offsetX = 0,
		offsetY = 0,
	}: {
		clip: {x: number; y: number; w: number; h: number};
		offsetX?: number;
		offsetY?: number;
	},
	options?: {
		context?: {cursorPosition?: {row: number; col: number}};
		skipScrollbars?: boolean;
	},
) {
	const {
		x,
		y,
		width,
		height,
		lines,
		children,
		stickyHeaders,
		scrollTop: regionScrollTop,
		scrollLeft: regionScrollLeft,
		cursorPosition: regionCursorPosition,
	} = region;
	const absX = x + offsetX;
	const absY = y + offsetY;

	const {x: clipX, y: clipY, w: clipW, h: clipH} = clip;

	const x1 = Math.max(clipX, absX);
	const y1 = Math.max(clipY, absY);
	const x2 = Math.min(clipX + clipW, absX + width);
	const y2 = Math.min(clipY + clipH, absY + height);

	if (x2 <= x1 || y2 <= y1) {
		return;
	}

	const myClip = {x: x1, y: y1, w: x2 - x1, h: y2 - y1};

	const scrollTop = regionScrollTop ?? 0;
	const scrollLeft = regionScrollLeft ?? 0;

	if (regionCursorPosition && options?.context) {
		const cursorX = absX + regionCursorPosition.col - scrollLeft;
		const cursorY = absY + regionCursorPosition.row - scrollTop;

		if (cursorX >= x1 && cursorX < x2 && cursorY >= y1 && cursorY < y2) {
			options.context.cursorPosition = {row: cursorY, col: cursorX};
		}
	}

	for (let y = myClip.y; y < myClip.y + myClip.h; y++) {
		const row = targetLines[y];
		if (!row) {
			continue;
		}

		const localY = y - absY + scrollTop;
		const sourceLine = lines[localY];
		if (!sourceLine) {
			continue;
		}

		const {x: clipX, w: clipW} = myClip;

		for (let x = clipX; x < clipX + clipW; x++) {
			const localX = x - absX + scrollLeft;
			const char = sourceLine[localX];
			if (char) {
				row[x] = char;
			}
		}
	}

	for (const child of children) {
		composeRegion(
			child,
			targetLines,
			{
				clip: myClip,
				offsetX: absX - scrollLeft,
				offsetY: absY - scrollTop,
			},
			options,
		);
	}

	for (const header of stickyHeaders) {
		const headerY = header.y + offsetY; // Absolute Y
		const headerH = header.lines.length;

		for (let i = 0; i < headerH; i++) {
			const y = headerY + i;
			if (y < myClip.y || y >= myClip.y + myClip.h) {
				continue;
			}

			const row = targetLines[y];
			if (!row) {
				continue;
			}

			const line = header.lines[i];
			if (!line) {
				continue;
			}

			const headerX = header.x + offsetX;
			const headerW = line.length;

			const {x: clipX, w: clipW} = myClip;

			const hx1 = Math.max(headerX, clipX);
			const hx2 = Math.min(headerX + headerW, clipX + clipW);

			for (let x = hx1; x < hx2; x++) {
				const cx = x - headerX;
				const char = line[cx];
				if (char) {
					row[x] = char;
				}
			}
		}
	}

	if (
		!options?.skipScrollbars &&
		region.isScrollable &&
		(region.scrollbarVisible ?? true)
	) {
		const scrollHeight = region.scrollHeight ?? 0;
		const scrollWidth = region.scrollWidth ?? 0;
		const isVerticalScrollbarVisible =
			(region.isVerticallyScrollable ?? false) && scrollHeight > region.height;
		const isHorizontalScrollbarVisible =
			(region.isHorizontallyScrollable ?? false) && scrollWidth > region.width;

		if (isVerticalScrollbarVisible) {
			const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
				calculateScrollbarThumb({
					scrollbarDimension: region.height,
					clientDimension: region.height,
					scrollDimension: scrollHeight,
					scrollPosition: scrollTop,
					axis: 'vertical',
				});

			const barX = absX + region.width - 1 - (region.marginRight ?? 0);

			renderScrollbar({
				x: barX,
				y: absY,
				thumb: {startIndex, endIndex, thumbStartHalf, thumbEndHalf},
				clip: myClip,
				axis: 'vertical',
				color: region.scrollbarThumbColor,
				setChar(x, y, char) {
					if (
						y >= 0 &&
						y < targetLines.length &&
						x >= 0 &&
						x < targetLines[0]!.length
					) {
						targetLines[y]![x] = char;
					}
				},
			});
		}

		if (isHorizontalScrollbarVisible) {
			const scrollbarWidth =
				region.width - (isVerticalScrollbarVisible ? 1 : 0);

			const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
				calculateScrollbarThumb({
					scrollbarDimension: scrollbarWidth,
					clientDimension: region.width,
					scrollDimension: scrollWidth,
					scrollPosition: scrollLeft,
					axis: 'horizontal',
				});

			const barY = absY + region.height - 1 - (region.marginBottom ?? 0);

			renderScrollbar({
				x: absX,
				y: barY,
				thumb: {startIndex, endIndex, thumbStartHalf, thumbEndHalf},
				clip: myClip,
				axis: 'horizontal',
				color: region.scrollbarThumbColor,
				setChar(x, y, char) {
					if (
						y >= 0 &&
						y < targetLines.length &&
						x >= 0 &&
						x < targetLines[0]!.length
					) {
						targetLines[y]![x] = char;
					}
				},
			});
		}
	}
}

export default renderer;
