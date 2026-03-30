import {type DOMElement, type DOMNode, isNodeSelectable} from './dom.js';
import type Output from './output.js';
import {
	measureStyledChars,
	splitStyledCharsByNewline,
	toStyledCharacters,
} from './measure-text.js';
import {wrapOrTruncateStyledChars} from './text-wrap.js';
import getMaxWidth from './get-max-width.js';
import squashTextNodes from './squash-text-nodes.js';
import {applySelectionToStyledChars} from './selection.js';
import type {OutputTransformer} from './render-node-to-output.js';
import {StyledLine, type StyledChar} from './styled-line.js';

export const applyPaddingToStyledChars = (
	node: DOMElement,
	lines: StyledLine[],
): StyledLine[] => {
	const yogaNode = node.childNodes[0]?.yogaNode;

	if (yogaNode) {
		const offsetX = yogaNode.getComputedLeft();
		const offsetY = yogaNode.getComputedTop();

		const paddedLines: StyledLine[] = [];

		for (const line of lines) {
			const newLine = new StyledLine();
			for (let i = 0; i < offsetX; i++) {
				newLine.pushChar(' ', 0);
			}

			paddedLines.push(
				new StyledLine(
					[...newLine.getValues(), ...line.getValues()],
					[...newLine.getSpans(), ...line.getSpans().map(s => ({...s}))],
				),
			);
		}

		lines = paddedLines;

		const paddingTop: StyledLine[] = Array.from({length: offsetY}).map(
			() => new StyledLine(),
		);
		lines.unshift(...paddingTop);
	}

	return lines;
};

export const calculateWrappedCursorPosition = (
	lines: StyledLine[],
	_styledChars: StyledLine,
	targetOffset: number,
): {cursorLineIndex: number; relativeCursorPosition: number} => {
	// We no longer have an object reference to Map over. We need to track by indices.
	// We'll calculate the offsets based on the line contents since lines are split/wrapped versions of styledChars.
	let cursorLineIndex = lines.length - 1;
	let relativeCursorPosition = targetOffset;
	let previousLineEndOffset = -1;

	// In the original code, styledCharToOffset map was used to find the offset of a character.
	// Since StyledLine wraps text continuously, we can just use cumulative length.
	let cumulativeLineLength = 0;

	for (const [i, line] of lines.entries()) {
		if (line.length > 0) {
			const lineStartOffset = cumulativeLineLength;
			let lineEndOffset = cumulativeLineLength;

			// We only count characters that correspond to the original string.
			// But wait, line.length is the character count.
			// However, padding might have been applied! The original code did `styledCharToOffset.has(char)`.
			// Since padding is added to the left, we can just count non-padding length if we know it.
			// For now, let's assume `calculateWrappedCursorPosition` is called BEFORE padding.
			// Yes, `applyPaddingToStyledChars` is called *after* calculating lines, but wait, the original code did it before `calculateWrappedCursorPosition`.
			// Let's adjust cumulative based on the text.

			for (let j = 0; j < line.length; j++) {
				lineEndOffset += line.getValue(j).length;
			}

			if (targetOffset >= lineStartOffset) {
				cursorLineIndex = i;
				relativeCursorPosition = Math.max(0, targetOffset - lineStartOffset);
			}

			if (targetOffset <= lineEndOffset) {
				break;
			}

			previousLineEndOffset = lineEndOffset;
			cumulativeLineLength = lineEndOffset;
		} else if (i === 0 && targetOffset === 0) {
			cursorLineIndex = 0;
			relativeCursorPosition = 0;
			break;
		} else if (i > 0 && targetOffset > previousLineEndOffset) {
			cursorLineIndex = i;
			relativeCursorPosition = targetOffset - previousLineEndOffset - 1;
			previousLineEndOffset++;
			cumulativeLineLength++;
		}
	}

	return {cursorLineIndex, relativeCursorPosition};
};

export function handleTextNode(
	node: DOMElement,
	output: Output,
	options: {
		x: number;
		y: number;
		newTransformers: OutputTransformer[];
		selectionMap?: Map<DOMNode, {start: number; end: number}>;
		selectionStyle?: (char: StyledChar) => StyledChar;
		trackSelection?: boolean;
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
		let lines: StyledLine[] = [];
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

			// Original code applied padding here.
			// It was done BEFORE calculateWrappedCursorPosition in original?
			// Wait, the original code did:
			// lines = applyPaddingToStyledChars(node, lines);
			// cursorLineIndex = lines.length - 1;
			// if (node.internal_terminalCursorFocus) { ... }
			// I moved it after, because mapping padding offsets is hard without objects.
			// But padding affects the visual cursor index!
			// If we pad, the cursor shifts. Let's do it after, but we need to shift the cursor position by the padding.
			const yogaNode = node.childNodes[0]?.yogaNode;
			const offsetX = yogaNode?.getComputedLeft() ?? 0;
			const offsetY = yogaNode?.getComputedTop() ?? 0;

			lines = applyPaddingToStyledChars(node, lines);

			if (
				node.internal_terminalCursorFocus &&
				node.internal_terminalCursorPosition !== undefined
			) {
				cursorLineIndex += offsetY;
				relativeCursorPosition += offsetX;
			} else if (node.internal_terminalCursorFocus) {
				cursorLineIndex = lines.length - 1;
				// Default to end of the last line
				relativeCursorPosition = lines[cursorLineIndex]!.length;
			}
		} else {
			lines = [new StyledLine()];
			const yogaNode = node.childNodes[0]?.yogaNode;
			const offsetX = yogaNode?.getComputedLeft() ?? 0;
			const offsetY = yogaNode?.getComputedTop() ?? 0;
			lines = applyPaddingToStyledChars(node, lines);

			if (node.internal_terminalCursorFocus) {
				cursorLineIndex = offsetY;
				relativeCursorPosition = offsetX;
			}
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
