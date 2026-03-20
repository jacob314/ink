/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {type StyledChar} from '@alcalzone/ansi-tokenize';
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

export const applyPaddingToStyledChars = (
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

export const calculateWrappedCursorPosition = (
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

export function handleTextNode(
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
