import test from 'ava';
import type {DOMElement} from '../src/dom.js';
import {calculateScroll} from '../src/scroll.js';
import type {Node as YogaNode} from 'yoga-layout';

const createMockNode = (
	clientHeight: number,
	actualScrollHeight: number,
): DOMElement => {
	let currentScrollHeight = actualScrollHeight;
	return {
		nodeName: 'ink-box',
		attributes: {},
		childNodes: [],
		parentNode: undefined,
		internalId: 1,
		style: {
			stableScrollback: true,
			overflowToBackbuffer: true,
			get scrollTop() {
				return currentScrollHeight;
			},
		},
		internal_accessibility: {},
		internalSticky: false,
		internalStickyAlternate: false,
		internalOpaque: false,
		internalScrollbar: true,
		internalMaxScrollTop: 0,
		internalIsScrollbackDirty: false,
		yogaNode: {
			getComputedWidth: () => 80,
			getComputedHeight: () => clientHeight,
			getComputedBorder: () => 0,
			getComputedPadding: () => 0,
			getComputedMargin: () => 0,
			getChildCount: () => 1,
			getChild: () => ({
				getComputedTop: () => 0,
				getComputedLeft: () => 0,
				getComputedHeight: () => currentScrollHeight,
				getComputedWidth: () => 80,
				getComputedMargin: () => 0,
			}),
		} as unknown as YogaNode,
		setCurrentScrollHeight(height: number) {
			currentScrollHeight = height;
		},
	} as any;
};

test('stableScrollback preserves scrollHeight when content shrinks', t => {
	const node = createMockNode(20, 100);

	calculateScroll(node);
	t.is(node.internal_scrollState?.actualScrollHeight, 100);
	t.is(node.internal_scrollState?.scrollHeight, 100);
	t.is(node.internalMaxScrollTop, 80); // 100 - 20

	// Mock shrinking actual content down to 50
	(node as any).setCurrentScrollHeight(50);

	// Calculate scroll again, without resize flag
	calculateScroll(node);
	t.is(node.internal_scrollState?.actualScrollHeight, 50);

	// Because stableScrollback is true, the scroll height should be padded to preserve the maximum scroll position
	// Padded scroll height = clampedMaxScrollTop + clientHeight
	// clampedMaxScrollTop = Math.min(80, actualScrollHeight - 1) = Math.min(80, 49) = 49
	// scrollHeight = 49 + 20 = 69
	t.is(node.internal_scrollState?.scrollHeight, 69);
});

test('stableScrollback padding is clamped to actualScrollHeight - 1', t => {
	const node = createMockNode(20, 100);

	calculateScroll(node);
	t.is(node.internalMaxScrollTop, 80); // 100 - 20

	// Shrink content extremely down to 5
	(node as any).setCurrentScrollHeight(5);

	calculateScroll(node);

	// Max allowed padding is 5 - 1 = 4.
	// So scrollHeight = 4 + 20 = 24.
	t.is(node.internal_scrollState?.actualScrollHeight, 5);
	t.is(node.internal_scrollState?.scrollHeight, 24);
});

test('stableScrollback bypasses padding on terminal resize', t => {
	const node = createMockNode(20, 100);

	calculateScroll(node);
	t.is(node.internalMaxScrollTop, 80); // 100 - 20

	// Shrink content down to 50
	(node as any).setCurrentScrollHeight(50);

	// Calculate scroll, WITH resize flag
	calculateScroll(node, true);

	t.is(node.internalMaxScrollTop, 0); // Reset by resize flag
	t.is(node.internal_scrollState?.actualScrollHeight, 50);
	// Because of resize flag, the scroll height padding was bypassed
	// scrollHeight = Math.max(50, 0 + 20) = 50
	t.is(node.internal_scrollState?.scrollHeight, 50);
});
