/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import test from 'ava';
import {
	Box,
	Text,
	getText,
	getTextOffset,
	render,
	type DOMElement,
	Selection,
	Range,
} from '../src/index.js';
import {createNode, createTextNode, appendChildNode} from '../src/dom.js';
import createStdout from './helpers/create-stdout.js';
import {CaptureRoot} from './helpers/capture-root.js';

test('getTextOffset behavior', t => {
	let node: DOMElement | undefined;

	const onCapture = (n: DOMElement) => {
		node = n;
	};

	const stdout = createStdout();
	render(
		<CaptureRoot flexDirection="column" width={10} onCapture={onCapture}>
			<Text>A</Text>
			<Box marginTop={1}>
				<Text>B</Text>
			</Box>
		</CaptureRoot>,
		{stdout},
	);

	t.truthy(node);
	if (!node) return;

	// Layout:
	// Line 0: "A"
	// Line 1: Gap (marginTop)
	// Line 2: "B"

	// Text content: "A\n\nB"
	// Indices:
	// 'A': 0
	// '\n': 1
	// '\n': 2
	// 'B': 3

	// Test 1: Click on 'A' (0, 0)
	t.is(getTextOffset(node, 0, 0, {snapToChar: 'start'}), 0);
	t.is(getTextOffset(node, 0, 0, {snapToChar: 'end'}), 1);

	// Test 2: Click right of 'A' (2, 0)
	t.is(
		getTextOffset(node, 2, 0, {snapToChar: 'start', snapToGap: 'end'}),
		1,
		'Clicking right of A should return end of A (1)',
	);
	t.is(
		getTextOffset(node, 2, 0, {snapToChar: 'end', snapToGap: 'end'}),
		1,
		'Clicking right of A should return end of A (1)',
	);

	// Test 3: Click in vertical gap (0, 1)
	t.is(
		getTextOffset(node, 0, 1, {snapToGap: 'end'}),
		3,
		'Clicking in gap with snapToGap: end should return start of B (3)',
	);
	t.is(
		getTextOffset(node, 0, 1, {snapToGap: 'start'}),
		1,
		'Clicking in gap with snapToGap: start should return end of A (1)',
	);
});

test('getTextOffset handles wrapping and coordinates before start of line', t => {
	let node: DOMElement | undefined;

	const onCapture = (n: DOMElement) => {
		node = n;
	};

	const stdout = createStdout();
	render(
		<CaptureRoot width={5} flexDirection="column" onCapture={onCapture}>
			<Text>1234567890</Text>
		</CaptureRoot>,
		{stdout},
	);

	t.truthy(node);
	if (!node) return;

	// Layout (width 5):
	// Line 0: "12345" (indices 0-4)
	// Line 1: "67890" (indices 5-9)

	t.is(
		getTextOffset(node, 0, 1, {snapToChar: 'start'}),
		5,
		'Start of second line should be index 5',
	);
});

test('getTextOffset handles wrapping with padding', t => {
	let node: DOMElement | undefined;

	const onCapture = (n: DOMElement) => {
		node = n;
	};

	const stdout = createStdout();
	render(
		<CaptureRoot
			width={10}
			paddingLeft={2}
			flexDirection="column"
			onCapture={onCapture}
		>
			<Box width={5}>
				<Text>1234567890</Text>
			</Box>
		</CaptureRoot>,
		{stdout},
	);

	t.truthy(node);
	if (!node) return;

	// Layout:
	// Box has paddingLeft 2.
	// Inner Box width 5.
	// Text wraps at 5 chars.
	// Line 0: "  12345" (Text starts at x=2)
	// Line 1: "  67890"

	// Test: Click at x=1, y=1.
	// This is inside the outer Box, but to the left of the Text node (which starts at x=2).
	// It is on the second line (y=1).
	const offset = getTextOffset(node, 1, 1, {snapToChar: 'start'});

	t.is(
		offset,
		7,
		'Clicking in padding left of wrapped line should return start of that line',
	);
});

test('getTextOffset handle borders', t => {
	let node: DOMElement | undefined;

	const onCapture = (n: DOMElement) => {
		node = n;
	};

	const stdout = createStdout();
	render(
		<CaptureRoot
			borderStyle="single"
			flexDirection="column"
			onCapture={onCapture}
		>
			<Text>Content</Text>
		</CaptureRoot>,
		{stdout},
	);

	t.truthy(node);
	if (!node) return;

	// Layout:
	// Row 0: ┌───────┐ (Border)
	// Row 1: │Content│ (Border + Text + Border)
	// Row 2: └───────┘ (Border)

	// Text content: "Content"
	// Indices:
	// C: 0
	// ...

	// Click on left border at Row 1 (x=0, y=1).
	// Content starts at x=1.
	const offsetLeft = getTextOffset(node, 0, 1, {snapToChar: 'start'});
	t.is(offsetLeft, 0, 'Clicking on left border should return start of text');

	// Click on top border (x=1, y=0).
	const offsetTop = getTextOffset(node, 1, 0, {snapToChar: 'start'});
	t.is(offsetTop, 0, 'Clicking on top border should return 0 (start of text)');
});

test('getText excludes userSelect: none content', t => {
	let node: DOMElement | undefined;

	const onCapture = (n: DOMElement) => {
		node = n;
	};

	const stdout = createStdout();
	render(
		<CaptureRoot flexDirection="column" onCapture={onCapture}>
			<Box flexDirection="row">
				<Text>A</Text>
				<Box userSelect="none">
					<Text>B</Text>
				</Box>
				<Text>C</Text>
			</Box>
		</CaptureRoot>,
		{stdout},
	);

	t.truthy(node);
	if (!node) return;

	// Layout: "ABC" visually.
	// "B" is userSelect: none.
	// getText should return "AC" (B is removed).

	const text = getText(node);
	t.is(
		text,
		'AC',
		'getText should exclude userSelect: none content and collapse layout',
	);

	// Test clicking on "B" (x=1).
	// Should snap to "C" (offset 1).
	const offset = getTextOffset(node, 1, 0, {snapToChar: 'start'});
	t.is(offset, 1, 'Clicking on userSelect: none should snap to next content');
});

test('Range: setStart and setEnd', t => {
	const node = createTextNode('Hello');
	const range = new Range();

	range.setStart(node, 1);
	range.setEnd(node, 4);

	t.is(range.startContainer, node);
	t.is(range.startOffset, 1);
	t.is(range.endContainer, node);
	t.is(range.endOffset, 4);
	t.false(range.collapsed);
	t.is(range.commonAncestorContainer, node);
	t.is(range.toString(), 'ell');
});

test('Range: collapse', t => {
	const node = createTextNode('Hello');
	const range = new Range();
	range.setStart(node, 1);
	range.setEnd(node, 4);

	range.collapse(true);
	t.is(range.startOffset, 1);
	t.is(range.endOffset, 1);
	t.true(range.collapsed);

	range.setEnd(node, 4);
	range.collapse(false);
	t.is(range.startOffset, 4);
	t.is(range.endOffset, 4);
	t.true(range.collapsed);
});

test('Range: selectNodeContents', t => {
	const node = createTextNode('Hello');
	const range = new Range();

	range.selectNodeContents(node);
	t.is(range.startOffset, 0);
	t.is(range.endOffset, 5);
	t.is(range.toString(), 'Hello');
});

test('Range: selectNode', t => {
	const parent = createNode('ink-box');
	const child = createTextNode('Hello');
	appendChildNode(parent, child);

	const range = new Range();
	range.selectNode(child);

	t.is(range.startContainer, parent);
	t.is(range.startOffset, 0);
	t.is(range.endContainer, parent);
	t.is(range.endOffset, 1);
});

test('Selection: addRange and removeRange', t => {
	const selection = new Selection();
	const range = new Range();
	const node = createTextNode('Hello');
	range.selectNodeContents(node);

	selection.addRange(range);
	t.is(selection.rangeCount, 1);
	t.is(selection.getRangeAt(0), range);
	t.is(selection.anchorNode, node);
	t.is(selection.anchorOffset, 0);
	t.is(selection.focusNode, node);
	t.is(selection.focusOffset, 5);

	selection.removeRange(range);
	t.is(selection.rangeCount, 0);
	t.is(selection.anchorNode, undefined);
});

test('Selection: removeAllRanges', t => {
	const selection = new Selection();
	const range = new Range();
	const node = createTextNode('Hello');
	range.selectNodeContents(node);
	selection.addRange(range);

	selection.removeAllRanges();
	t.is(selection.rangeCount, 0);
});

test('Selection: collapse', t => {
	const selection = new Selection();
	const node = createTextNode('Hello');

	selection.collapse(node, 2);
	t.is(selection.rangeCount, 1);
	t.is(selection.anchorNode, node);
	t.is(selection.anchorOffset, 2);
	t.true(selection.isCollapsed);
});

test('Selection: containsNode', t => {
	const parent = createNode('ink-box');
	const child1 = createTextNode('A');
	const child2 = createTextNode('B');
	const child3 = createTextNode('C');
	appendChildNode(parent, child1);
	appendChildNode(parent, child2);
	appendChildNode(parent, child3);

	const selection = new Selection();
	const range = new Range();

	// Select "B" fully (from parent index 1 to 2)
	// Actually range selects offsets in parent if we selectNode
	range.selectNode(child2);
	selection.addRange(range);

	t.true(selection.containsNode(child2), 'Should contain fully selected node');
	t.false(selection.containsNode(child1), 'Should not contain sibling');
	t.false(selection.containsNode(child3), 'Should not contain other sibling');

	// Partial containment
	const rangePartial = new Range();
	// Start in A, end in B
	rangePartial.setStart(child1, 0);
	rangePartial.setEnd(child2, 1); // Include first char of B
	selection.removeAllRanges();
	selection.addRange(rangePartial);

	t.true(
		selection.containsNode(child1, true),
		'Should partially contain start node',
	);
	t.true(
		selection.containsNode(child2, true),
		'Should partially contain end node',
	);
	t.false(
		selection.containsNode(child3, true),
		'Should not contain unrelated node',
	);
});
