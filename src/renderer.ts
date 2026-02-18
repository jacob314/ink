import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import renderNodeToOutput, {
	renderNodeToScreenReaderOutput,
} from './render-node-to-output.js';
import Output, {type Region, flattenRegion} from './output.js';
import {
	type DOMElement,
	type DOMNode,
	isNodeSelectable,
	type StickyHeader,
} from './dom.js';
import {type Selection} from './selection.js';

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
			node,
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
				node: node.staticNode,
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

export default renderer;
