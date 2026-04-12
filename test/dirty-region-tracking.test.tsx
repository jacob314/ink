import test from 'ava';
import React, {act, useRef, useState} from 'react';
import {Box, StaticRender, Text, type DOMElement} from '../src/index.js';
import {render} from './helpers/render.js';
import {waitFor} from './helpers/wait-for.js';

const StaticPair = React.memo(() => {
	return (
		<>
			<StaticRender width={20}>{() => <Text>Static 1</Text>}</StaticRender>
			<StaticRender width={20}>{() => <Text>Static 2</Text>}</StaticRender>
		</>
	);
});

test.serial(
	'reuses cached regions for clean non-static box subtrees',
	async t => {
		const trackedRef = React.createRef<DOMElement>();
		let updateCounterGlobal!: React.Dispatch<React.SetStateAction<number>>;

		function Example() {
			const [counter, setCounter] = useState(0);
			updateCounterGlobal = setCounter;

			return (
				<Box flexDirection="column" width={40}>
					<Box ref={trackedRef} flexDirection="column">
						<StaticPair />
					</Box>

					<Text>Counter: {counter}</Text>
				</Box>
			);
		}

		const instance = await render(<Example />, 40, {
			terminalHeight: 10,
			terminalBuffer: true,
			renderProcess: false,
			maxFps: 1000,
		});

		await instance.waitUntilReady();

		await act(async () => {
			updateCounterGlobal(1);
		});

		await instance.waitUntilReady();

		await waitFor(() => Boolean(trackedRef.current?.cachedRegion));

		const initialCache = trackedRef.current?.cachedRegion;
		t.truthy(initialCache);

		await act(async () => {
			updateCounterGlobal(2);
		});

		await instance.waitUntilReady();
		await waitFor(() => trackedRef.current?.cachedRegion === initialCache);

		t.is(trackedRef.current?.cachedRegion, initialCache);

		await instance.unmount();
	},
);

test.serial('invalidates cached regions when the subtree changes', async t => {
	const trackedRef = React.createRef<DOMElement>();
	let updateCounterGlobal!: React.Dispatch<React.SetStateAction<number>>;
	let updateShowExtraGlobal!: React.Dispatch<React.SetStateAction<boolean>>;

	function Example() {
		const [counter, setCounter] = useState(0);
		const [showExtra, setShowExtra] = useState(false);
		updateCounterGlobal = setCounter;
		updateShowExtraGlobal = setShowExtra;
		const renderCountRef = useRef(0);
		renderCountRef.current++;

		return (
			<Box flexDirection="column" width={40}>
				<Box ref={trackedRef} flexDirection="column">
					<StaticPair />
					<Text>Render Count: {renderCountRef.current}</Text>
					{showExtra && <Text>Extra line</Text>}
				</Box>

				<Text>Footer: {counter}</Text>
			</Box>
		);
	}

	const instance = await render(<Example />, 40, {
		terminalHeight: 10,
		terminalBuffer: true,
		renderProcess: false,
		maxFps: 1000,
	});

	await instance.waitUntilReady();

	await act(async () => {
		updateCounterGlobal(1);
	});

	await instance.waitUntilReady();
	await waitFor(() => Boolean(trackedRef.current?.cachedRegion));

	const initialCache = trackedRef.current?.cachedRegion;
	t.truthy(initialCache);

	await act(async () => {
		updateShowExtraGlobal(true);
	});

	await instance.waitUntilReady();
	await waitFor(
		() =>
			Boolean(trackedRef.current?.cachedRegion) &&
			trackedRef.current?.cachedRegion !== initialCache,
	);

	t.not(trackedRef.current?.cachedRegion, initialCache);

	await instance.unmount();
});
