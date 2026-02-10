import React from 'react';
import test from 'ava';
import {render, Box, Text} from '../src/index.js';
import {getAddedScrollHeight} from '../src/measure-element.js';
import {getScrollHeight, getScrollTop} from '../src/scroll.js';
import {type DOMElement} from '../src/dom.js';

type TestComponentProps = {
	readonly count: number;
	readonly stable: boolean;
	readonly refCb: (ref: DOMElement | undefined) => void;
};

function TestComponent({count, stable, refCb}: TestComponentProps) {
	return (
		<Box
			ref={ref => {
				refCb(ref ?? undefined);
			}}
			overflowToBackbuffer
			flexDirection="column"
			height={10}
			overflowY="scroll"
			stableScrollback={stable}
		>
			{Array.from({length: count}).map((_, i) => (
				<Box key={String(i)} flexShrink={0}>
					<Text>Line {i}</Text>
				</Box>
			))}
		</Box>
	);
}

test('stableScrollback keeps scrollHeight stable when content shrinks', async t => {
	let rootRef: DOMElement | undefined;

	const {rerender} = render(
		<TestComponent
			stable
			count={100}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
		{terminalBuffer: true, debug: true},
	);

	// Initial scroll height should be 100
	t.is(getScrollHeight(rootRef!), 100);

	// Reduce count to 50
	rerender(
		<TestComponent
			stable
			count={50}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
	);

	// Scroll height should REMAIN 100 because stableScrollback is true
	t.is(getScrollHeight(rootRef!), 100);

	// Turn off stableScrollback
	rerender(
		<TestComponent
			count={50}
			refCb={ref => {
				rootRef = ref;
			}}
			stable={false}
		/>,
	);

	// Scroll height should now reflect actual content (50)
	t.is(getScrollHeight(rootRef!), 50);
	t.is(getAddedScrollHeight(rootRef!), 0);
});

test('getAddedScrollHeight returns the amount of padding added', async t => {
	let rootRef: DOMElement | undefined;

	const {rerender} = render(
		<TestComponent
			stable
			count={100}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
		{terminalBuffer: true, debug: true},
	);

	t.is(getAddedScrollHeight(rootRef!), 0);

	// Reduce count to 50
	rerender(
		<TestComponent
			stable
			count={50}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
	);

	// Actual is 50, stable is 100. Added should be 50.
	t.is(getAddedScrollHeight(rootRef!), 50);
});

type TestComponent2Props = {
	readonly items: readonly string[];
	readonly stable: boolean;
	readonly refCb: (ref: DOMElement | undefined) => void;
};

function TestComponent2({items, stable, refCb}: TestComponent2Props) {
	return (
		<Box
			ref={ref => {
				refCb(ref ?? undefined);
			}}
			overflowToBackbuffer
			flexDirection="column"
			height={10}
			overflowY="scroll"
			scrollTop={50}
			stableScrollback={stable}
		>
			{items.map(item => (
				<Box key={item} flexShrink={0}>
					<Text>Line {item}</Text>
				</Box>
			))}
		</Box>
	);
}

test('stableScrollback resets when history is invalidated (prepends)', async t => {
	let rootRef: DOMElement | undefined;

	const initialItems = Array.from({length: 100}, (_, i) => String(i));
	const {rerender} = render(
		<TestComponent2
			stable
			items={initialItems}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
		{terminalBuffer: true, debug: true},
	);

	t.is(getScrollHeight(rootRef!), 100);

	// Remove 20 items from the END. Scroll height should stay 100.
	const lessItems = initialItems.slice(0, 80);
	rerender(
		<TestComponent2
			stable
			items={lessItems}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
	);
	t.is(getScrollHeight(rootRef!), 100);

	// Now invalidate history by removing items from the START.
	const invalidatedItems = initialItems.slice(1, 80);
	rerender(
		<TestComponent2
			stable
			items={invalidatedItems}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
	);

	// On the frame where we re-rendered with 1..79, calculateScroll still sees old internalMaxScrollHeight=100.
	// BUT during the render phase, TerminalBuffer will detect the change in history and set internalIsScrollbackDirty = true.

	// So we need one more rerender or wait for the effect to propagate.
	rerender(
		<TestComponent2
			stable
			items={invalidatedItems}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
	);

	// Now it should have snapped to 79.
	t.is(getScrollHeight(rootRef!), 79);
});

type ViewportTestProps = {
	readonly height: number;
	readonly stable: boolean;
	readonly refCb: (ref: DOMElement | undefined) => void;
};

function ViewportTest({height, stable, refCb}: ViewportTestProps) {
	return (
		<Box
			ref={ref => {
				refCb(ref ?? undefined);
			}}
			overflowToBackbuffer
			flexDirection="column"
			height={height}
			overflowY="scroll"
			stableScrollback={stable}
		>
			{Array.from({length: 100}).map((_, i) => (
				<Box key={String(i)} flexShrink={0}>
					<Text>Line {i}</Text>
				</Box>
			))}
		</Box>
	);
}

test('stableScrollback maintains maxScrollTop when viewport grows', async t => {
	let rootRef: DOMElement | undefined;

	const {rerender} = render(
		<ViewportTest
			stable
			height={10}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
		{terminalBuffer: true, debug: true},
	);

	// Actual scroll height is 100. clientHeight is 10. maxScrollTop is 90.
	t.is(getScrollHeight(rootRef!), 100);
	t.is(getAddedScrollHeight(rootRef!), 0);

	// Grow viewport to 20.
	// New actual maxScrollTop would be 100 - 20 = 80.
	// BUT stableScrollback should keep it at 90.
	// So scrollHeight should become 90 + 20 = 110.
	rerender(
		<ViewportTest
			stable
			height={20}
			refCb={ref => {
				rootRef = ref;
			}}
		/>,
	);

	t.is(getScrollHeight(rootRef!), 110);
	t.is(getAddedScrollHeight(rootRef!), 10);
});
