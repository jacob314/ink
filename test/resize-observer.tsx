import React, {useRef, useEffect} from 'react';
import test from 'ava';
import {
	render,
	Box,
	Text,
	StaticRender,
	ResizeObserver,
	type DOMElement,
} from '../src/index.js';
import {waitFor} from './helpers/wait-for.js';
import createStdout from './helpers/create-stdout.js';

function ObservedBox({
	onResize,
	children,
	...props
}: {
	readonly onResize: (dims: {width: number; height: number}) => void;
	readonly children?: React.ReactNode;
} & React.ComponentProps<typeof Box>) {
	const ref = useRef<DOMElement>(null);

	useEffect(() => {
		if (!ref.current) {
			return;
		}

		const observer = new ResizeObserver(entries => {
			const entry = entries[0];
			if (entry) {
				onResize(entry.contentRect);
			}
		});

		observer.observe(ref.current);

		return () => {
			observer.disconnect();
		};
	}, [onResize]);

	return (
		<Box ref={ref} {...props}>
			{children}
		</Box>
	);
}

test('ResizeObserver detects size changes', async t => {
	const resizeCalls: Array<{width: number; height: number}> = [];
	const onResize = (dims: {width: number; height: number}) => {
		resizeCalls.push(dims);
	};

	function App({
		width,
		height,
		onResize,
	}: {
		readonly width: number;
		readonly height: number;
		readonly onResize: (dims: {width: number; height: number}) => void;
	}) {
		return (
			<Box width={width} height={height}>
				<ObservedBox width="100%" height="100%" onResize={onResize} />
			</Box>
		);
	}

	const stdout = createStdout();
	const {rerender, unmount} = render(
		<App width={10} height={5} onResize={onResize} />,
		{stdout},
	);

	await waitFor(() => resizeCalls.length > 0);
	t.is(resizeCalls.length, 1);
	t.deepEqual(resizeCalls[0], {width: 10, height: 5});

	rerender(<App width={20} height={10} onResize={onResize} />);
	await waitFor(() => resizeCalls.length > 1);
	t.is(resizeCalls.length, 2);
	t.deepEqual(resizeCalls[1], {width: 20, height: 10});

	unmount();
});

test('ResizeObserver handles multiple observers', async t => {
	let callCount = 0;
	const onResize = () => {
		callCount++;
	};

	function Child({onResize}: {readonly onResize: () => void}) {
		const ref = useRef<DOMElement>(null);

		useEffect(() => {
			if (!ref.current) {
				return;
			}

			const observer1 = new ResizeObserver(() => {
				onResize();
			});

			const observer2 = new ResizeObserver(() => {
				onResize();
			});

			observer1.observe(ref.current);
			observer2.observe(ref.current);

			return () => {
				observer1.disconnect();
				observer2.disconnect();
			};
		}, [onResize]);

		return <Box ref={ref} width={10} height={5} />;
	}

	const stdout = createStdout();
	const {rerender, unmount} = render(
		<Box>
			<Child onResize={onResize} />
		</Box>,
		{stdout},
	);
	await waitFor(() => callCount === 2);
	// Initial render triggers both observers once
	t.is(callCount, 2);

	// Rerender with same size shouldn't trigger observers
	rerender(
		<Box>
			<Child onResize={onResize} />
		</Box>,
	);

	// Wait a bit to ensure it doesn't get called.
	// As we are replacing fixed waits, and there is no condition to wait for (we want to ensure something DOES NOT happen),
	// we can simply check after a tiny delay or just assert directly. The original test had an arbitrary 100ms delay.
	// It is better to just yield to the event loop.
	await new Promise(resolve => {
		setTimeout(resolve, 10);
	});
	t.is(callCount, 2);

	unmount();
});

test('ResizeObserver unobserve works', async t => {
	let callCount = 0;
	const onResize = () => {
		callCount++;
	};

	function Child({onResize}: {readonly onResize: () => void}) {
		const ref = useRef<DOMElement>(null);

		useEffect(() => {
			if (!ref.current) {
				return;
			}

			const observer = new ResizeObserver(() => {
				onResize();
			});

			observer.observe(ref.current);

			// Unobserve immediately to test it
			setTimeout(() => {
				observer.unobserve(ref.current!);
			}, 0);

			return () => {
				observer.disconnect();
			};
		}, [onResize]);

		return <Box ref={ref} width="100%" height="100%" />;
	}

	function App({
		width,
		onResize,
	}: {
		readonly width: number;
		readonly onResize: () => void;
	}) {
		return (
			<Box width={width} height={5}>
				<Child onResize={onResize} />
			</Box>
		);
	}

	const stdout = createStdout();
	const {rerender, unmount} = render(<App width={10} onResize={onResize} />, {
		stdout,
	});
	await waitFor(() => callCount === 1);
	t.is(callCount, 1);

	// Change width, but observer should be unobserved by now
	// We need to wait for the timeout in useEffect
	await new Promise(resolve => {
		setTimeout(resolve, 10);
	});
	rerender(<App width={20} onResize={onResize} />);

	await new Promise(resolve => {
		setTimeout(resolve, 10);
	});
	t.is(callCount, 1);

	unmount();
});

test('ResizeObserver attached to child of a StaticRender element still gets successfully called the very time it is rendered with a valid height', async t => {
	const resizeCalls: Array<{width: number; height: number}> = [];
	const onResize = (dims: {width: number; height: number}) => {
		resizeCalls.push(dims);
	};

	const stdout = createStdout();
	const {unmount} = render(
		<StaticRender width={100} style={{flexDirection: 'column'}}>
			{() => <ObservedBox width={20} height={10} onResize={onResize} />}
		</StaticRender>,
		{stdout},
	);

	await waitFor(() => resizeCalls.length === 1);

	t.is(resizeCalls.length, 1);
	t.deepEqual(resizeCalls[0], {width: 20, height: 10});

	unmount();
});

test('ResizeObserver inside StaticRender does not yield NaN', async t => {
	const resizeCalls: Array<{width: number; height: number}> = [];
	const onResize = (dims: {width: number; height: number}) => {
		resizeCalls.push(dims);
	};

	const stdout = createStdout();
	const {unmount} = render(
		<StaticRender width={100}>
			{() => <ObservedBox width="100%" height="100%" onResize={onResize} />}
		</StaticRender>,
		{stdout},
	);

	await waitFor(() => resizeCalls.length === 1);

	t.is(resizeCalls.length, 1);
	t.deepEqual(resizeCalls[0], {width: 100, height: 0});

	unmount();
});

test('ResizeObserver attached to parent of a StaticRender element does not get spurious updates', async t => {
	const resizeCalls: Array<{width: number; height: number}> = [];
	const onResize = (dims: {width: number; height: number}) => {
		resizeCalls.push(dims);
	};

	const stdout = createStdout();
	const {unmount} = render(
		<ObservedBox
			width={50}
			flexDirection="column"
			borderStyle="single"
			onResize={onResize}
		>
			<Text>Parent</Text>
			<StaticRender width={50}>
				{() => (
					<Box width={30} height={5}>
						<Text>Static Content</Text>
					</Box>
				)}
			</StaticRender>
		</ObservedBox>,
		{stdout},
	);

	await waitFor(() => resizeCalls.length === 1);

	// The parent has fixed width of 50, but auto height based on its children.
	// Initial render height is 8 (1 line text "Parent" + 5 line Static Content + 2 lines border).
	// When StaticRender gets evaluated, it outputs static content directly to the terminal,
	// but it shouldn't cause spurious height adjustments in its parent Box when its
	// internal children are cached and removed from the main layout tree.
	// Therefore, we expect exactly 1 resize event with {width: 50, height: 8}.
	t.is(resizeCalls.length, 1);
	t.deepEqual(resizeCalls[0], {width: 50, height: 8});
	unmount();
});
