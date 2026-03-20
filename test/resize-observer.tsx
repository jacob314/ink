import React, {useRef, useEffect} from 'react';
import test from 'ava';
import {render, Box, ResizeObserver, type DOMElement} from '../src/index.js';
import {waitFor} from './helpers/wait-for.js';
import createStdout from './helpers/create-stdout.js';

test('ResizeObserver detects size changes', async t => {
	const resizeCalls: Array<{width: number; height: number}> = [];
	const onResize = (dims: {width: number; height: number}) => {
		resizeCalls.push(dims);
	};

	function Child({
		onResize,
	}: {
		readonly onResize: (dims: {width: number; height: number}) => void;
	}) {
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

		return <Box ref={ref} width="100%" height="100%" />;
	}

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
				<Child onResize={onResize} />
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
