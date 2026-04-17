import test from 'ava';
import React, {act, useState} from 'react';
import {Box, StaticRender, Text, type DOMElement} from '../src/index.js';
import {render} from './helpers/render.js';
import {waitFor} from './helpers/wait-for.js';

const defaultTestConfig = {
	terminalHeight: 10,
	terminalBuffer: true,
	renderProcess: false,
	maxFps: 1000,
};

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
		let externalSetCounter!: React.Dispatch<React.SetStateAction<number>>;

		function Example() {
			const [counter, setCounter] = useState(0);
			externalSetCounter = setCounter;

			return (
				<Box flexDirection="column" width={40}>
					<Box ref={trackedRef} flexDirection="column">
						<StaticPair />
					</Box>

					<Text>Counter: {counter}</Text>
				</Box>
			);
		}

		const instance = await render(<Example />, 40, defaultTestConfig);

		await instance.waitUntilReady();

		await waitFor(() => Boolean(trackedRef.current?.cachedRegion));

		const staticChildren =
			trackedRef.current?.childNodes.filter(
				(childNode): childNode is DOMElement =>
					childNode.nodeName === 'ink-static-render',
			) ?? [];
		t.is(staticChildren.length, 2);
		t.true(
			staticChildren.every(childNode => childNode.childNodes.length === 0),
		);

		const initialCache = trackedRef.current?.cachedRegion;
		t.truthy(initialCache);

		await act(async () => {
			externalSetCounter(1);
		});

		await instance.waitUntilReady();
		await waitFor(() => trackedRef.current?.cachedRegion === initialCache);

		t.is(trackedRef.current?.cachedRegion, initialCache);

		await instance.unmount();
	},
);

test.serial('invalidates cached regions when the subtree changes', async t => {
	const trackedRef = React.createRef<DOMElement>();
	let externalSetShowExtra!: React.Dispatch<React.SetStateAction<boolean>>;

	function Example() {
		const [showExtra, setShowExtra] = useState(false);
		externalSetShowExtra = setShowExtra;

		return (
			<Box flexDirection="column" width={40}>
				<Box ref={trackedRef} flexDirection="column">
					<StaticPair />
					{showExtra && <Text>Extra line</Text>}
				</Box>
			</Box>
		);
	}

	const instance = await render(<Example />, 40, defaultTestConfig);

	await instance.waitUntilReady();
	await waitFor(() => Boolean(trackedRef.current?.cachedRegion));

	const initialCache = trackedRef.current?.cachedRegion;
	t.truthy(initialCache);

	await act(async () => {
		externalSetShowExtra(true);
	});

	await instance.waitUntilReady();
	await waitFor(
		() =>
			Boolean(trackedRef.current?.cachedRegion) &&
			trackedRef.current?.cachedRegion !== initialCache,
	);

	t.not(trackedRef.current?.cachedRegion, initialCache);
	t.true(instance.lastFrame().includes('Extra line'));

	await instance.unmount();
});

test.serial(
	'invalidates cached regions when nested descendants update',
	async t => {
		const trackedRef = React.createRef<DOMElement>();
		let externalSetValue!: React.Dispatch<React.SetStateAction<number>>;

		function Example() {
			const [value, setValue] = useState(0);
			externalSetValue = setValue;

			return (
				<Box flexDirection="column" width={40}>
					<Box ref={trackedRef} flexDirection="column">
						<StaticPair />
						<Box flexDirection="column">
							<Text>Nested value: {value}</Text>
						</Box>
					</Box>
				</Box>
			);
		}

		const instance = await render(<Example />, 40, defaultTestConfig);

		await instance.waitUntilReady();
		await waitFor(() => Boolean(trackedRef.current?.cachedRegion));

		const initialCache = trackedRef.current?.cachedRegion;
		t.truthy(initialCache);

		await act(async () => {
			externalSetValue(1);
		});

		await instance.waitUntilReady();
		await waitFor(
			() =>
				Boolean(trackedRef.current?.cachedRegion) &&
				trackedRef.current?.cachedRegion !== initialCache,
		);

		t.not(trackedRef.current?.cachedRegion, initialCache);
		t.true(instance.lastFrame().includes('Nested value: 1'));

		await instance.unmount();
	},
);

test.serial(
	'invalidates cached regions when keyed children are prepended',
	async t => {
		const trackedRef = React.createRef<DOMElement>();
		let externalSetItems!: React.Dispatch<React.SetStateAction<number[]>>;

		function Example() {
			const [items, setItems] = useState([1]);
			externalSetItems = setItems;

			return (
				<Box flexDirection="column" width={40}>
					<Box ref={trackedRef} flexDirection="column">
						<StaticPair />
						{items.map(item => (
							<Text key={item}>Item {item}</Text>
						))}
					</Box>
				</Box>
			);
		}

		const instance = await render(<Example />, 40, defaultTestConfig);

		await instance.waitUntilReady();
		await waitFor(() => Boolean(trackedRef.current?.cachedRegion));

		const initialCache = trackedRef.current?.cachedRegion;
		t.truthy(initialCache);

		await act(async () => {
			externalSetItems([0, 1]);
		});

		await instance.waitUntilReady();
		await waitFor(
			() =>
				Boolean(trackedRef.current?.cachedRegion) &&
				trackedRef.current?.cachedRegion !== initialCache,
		);

		const frame = instance.lastFrame();
		t.not(trackedRef.current?.cachedRegion, initialCache);
		t.true(frame.includes('Item 0'));
		t.true(frame.indexOf('Item 0') < frame.indexOf('Item 1'));

		await instance.unmount();
	},
);
