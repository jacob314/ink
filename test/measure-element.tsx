import React, {useRef, useLayoutEffect} from 'react';
import test from 'ava';
import {spy} from 'sinon';
import {
	render,
	Box,
	measureElement,
	getBoundingBox,
	getInnerWidth,
	getInnerHeight,
	getScrollHeight,
	getScrollWidth,
	getVerticalScrollbarBoundingBox,
	getHorizontalScrollbarBoundingBox,
	Text,
	type DOMElement,
} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('measure element', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = measureElement(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box ref={ref} width={10} height={10} padding={2}>
				<Text>X</Text>
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		width: 10,
		height: 10,
	});
});

test('get bounding box', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box ref={ref} width={10} height={10} padding={2}>
				<Text>X</Text>
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 0,
		y: 0,
		width: 10,
		height: 10,
	});
});

test('get inner width', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const innerWidth = getInnerWidth(ref.current);
				onLayout({innerWidth});
			}
		});

		return (
			<Box ref={ref} width={10} padding={2} borderStyle="single">
				<Text>X</Text>
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		innerWidth: 8,
	});
});

test('get inner height', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const innerHeight = getInnerHeight(ref.current);
				onLayout({innerHeight});
			}
		});

		return (
			<Box ref={ref} height={10} padding={2} borderStyle="single">
				<Text>X</Text>
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		innerHeight: 8,
	});
});

test('get bounding box of nested element', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box paddingTop={2} paddingLeft={5}>
				<Box ref={ref} marginTop={2} marginLeft={5} width={10} height={10} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.like(onLayout.firstCall.args[0], {
		x: 10,
		y: 4,
		width: 10,
		height: 10,
	});
});

test('get scroll height and width', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const scrollHeight = getScrollHeight(ref.current);
				const scrollWidth = getScrollWidth(ref.current);
				onLayout({scrollHeight, scrollWidth});
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflow="scroll">
				<Box width={20} height={20} flexShrink={0} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.like(onLayout.firstCall.args[0], {
		scrollWidth: 20,
		scrollHeight: 20,
	});
});

test('get bounding box with scroll position', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box
				width={10}
				height={10}
				overflow="scroll"
				scrollTop={5}
				scrollLeft={5}
			>
				<Box
					ref={ref}
					marginTop={2}
					marginLeft={5}
					width={10}
					height={10}
					flexShrink={0}
				/>
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.like(onLayout.firstCall.args[0], {
		x: 0,
		y: 0,
		width: 10,
		height: 10,
	});
});

test('get vertical scrollbar bounding box', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getVerticalScrollbarBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflowY="scroll">
				<Box height={20} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 9,
		y: 0,
		width: 1,
		height: 10,
		thumb: {
			x: 9,
			y: 0,
			width: 1,
			height: 5,
			start: 0,
			end: 5,
			startHalf: 0,
			endHalf: 10,
		},
	});
});

test('get vertical scrollbar bounding box with border', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getVerticalScrollbarBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box
				ref={ref}
				width={10}
				height={10}
				overflowY="scroll"
				borderStyle="single"
			>
				<Box height={20} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 8,
		y: 1,
		width: 1,
		height: 8,
		thumb: {
			x: 8,
			y: 1,
			width: 1,
			height: 3,
			start: 0,
			end: 3,
			startHalf: 0,
			endHalf: 6,
		},
	});
});

test('get vertical scrollbar bounding box scrolled', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getVerticalScrollbarBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflowY="scroll" scrollTop={5}>
				<Box height={20} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 9,
		y: 0,
		width: 1,
		height: 10,
		thumb: {
			x: 9,
			y: 2,
			width: 1,
			height: 6,
			start: 2,
			end: 8,
			startHalf: 5,
			endHalf: 15,
		},
	});
});

test('get horizontal scrollbar bounding box', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getHorizontalScrollbarBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflowX="scroll">
				<Box width={20} flexShrink={0} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 0,
		y: 9,
		width: 10,
		height: 1,
		thumb: {
			x: 0,
			y: 9,
			width: 5,
			height: 1,
			start: 0,
			end: 5,
			startHalf: 0,
			endHalf: 10,
		},
	});
});

test('get horizontal scrollbar bounding box scrolled', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getHorizontalScrollbarBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflowX="scroll" scrollLeft={5}>
				<Box width={20} flexShrink={0} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 0,
		y: 9,
		width: 10,
		height: 1,
		thumb: {
			x: 2,
			y: 9,
			width: 6,
			height: 1,
			start: 2,
			end: 8,
			startHalf: 5,
			endHalf: 15,
		},
	});
});

test('get horizontal scrollbar bounding box with border', t => {
	const onLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				const layout = getHorizontalScrollbarBoundingBox(ref.current);
				onLayout(layout);
			}
		});

		return (
			<Box
				ref={ref}
				width={10}
				height={10}
				overflowX="scroll"
				borderStyle="single"
			>
				<Box width={20} flexShrink={0} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onLayout.calledOnce);
	t.deepEqual(onLayout.firstCall.args[0], {
		x: 1,
		y: 8,
		width: 8,
		height: 1,
		thumb: {
			x: 1,
			y: 8,
			width: 3,
			height: 1,
			start: 0,
			end: 3,
			startHalf: 0,
			endHalf: 6,
		},
	});
});

test('get both scrollbars bounding box', t => {
	const onVerticalLayout = spy();
	const onHorizontalLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				onVerticalLayout(getVerticalScrollbarBoundingBox(ref.current));
				onHorizontalLayout(getHorizontalScrollbarBoundingBox(ref.current));
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflow="scroll">
				<Box width={20} height={20} flexShrink={0} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onVerticalLayout.calledOnce);
	t.deepEqual(onVerticalLayout.firstCall.args[0], {
		x: 9,
		y: 0,
		width: 1,
		height: 10,
		thumb: {
			x: 9,
			y: 0,
			width: 1,
			height: 5,
			start: 0,
			end: 5,
			startHalf: 0,
			endHalf: 10,
		},
	});

	t.true(onHorizontalLayout.calledOnce);
	t.deepEqual(onHorizontalLayout.firstCall.args[0], {
		x: 0,
		y: 9,
		width: 9,
		height: 1,
		thumb: {
			x: 0,
			y: 9,
			width: 5,
			height: 1,
			start: 0,
			end: 5,
			startHalf: 0,
			endHalf: 9,
		},
	});
});

test('get scrollbar bounding box when not scrollable', t => {
	const onVerticalLayout = spy();
	const onHorizontalLayout = spy();

	function Test() {
		const ref = useRef<DOMElement>(null);

		useLayoutEffect(() => {
			if (ref.current) {
				onVerticalLayout(getVerticalScrollbarBoundingBox(ref.current));
				onHorizontalLayout(getHorizontalScrollbarBoundingBox(ref.current));
			}
		});

		return (
			<Box ref={ref} width={10} height={10} overflow="scroll">
				<Box width={5} height={5} />
			</Box>
		);
	}

	render(<Test />, {
		stdout: createStdout(),
		debug: true,
	});

	t.true(onVerticalLayout.calledOnce);
	t.is(onVerticalLayout.firstCall.args[0], undefined);

	t.true(onHorizontalLayout.calledOnce);
	t.is(onHorizontalLayout.firstCall.args[0], undefined);
});
