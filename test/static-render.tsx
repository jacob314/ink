/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'ava';
import React from 'react';
import {StaticRender, Text, Box, type DOMElement} from '../src/index.js';
import {waitFor} from './helpers/wait-for.js';
import {render as renderTerminal} from './helpers/render.js';

const defaultTestConfig = {
	terminalHeight: 10,
	terminalBuffer: true,
	renderProcess: false,
	maxFps: 1000,
};

test.serial('StaticRender renders children', async t => {
	const instance = await renderTerminal(
		<StaticRender width={100}>{() => <Text>Hello Static</Text>}</StaticRender>,
		100,
		defaultTestConfig,
	);

	await instance.waitUntilReady();
	t.is(instance.lastFrame().trim(), 'Hello Static');
	await instance.unmount();
});

test.serial('StaticRender with Box and multiple children', async t => {
	const instance = await renderTerminal(
		<StaticRender width={100}>
			{() => (
				<Box flexDirection="column">
					<Text>Line 1</Text>
					<Text>Line 2</Text>
				</Box>
			)}
		</StaticRender>,
		100,
		defaultTestConfig,
	);

	await instance.waitUntilReady();
	const output = instance.lastFrame();
	t.is(
		output.trim(),
		`Line 1
Line 2`,
	);
	await instance.unmount();
});

test.serial('StaticRender respects style prop', async t => {
	// This test verifies that we can style the container of StaticRender (e.g. padding)
	// The <ink-static-render> element should accept styles.
	// In my implementation, I passed `style` to `<ink-static-render>`.
	// And `src/dom.ts` defines `ink-static-render` in ElementNames.
	// `src/styles.ts` applies styles to yoga nodes.
	// But `ink-static-render` node has a yoga node?
	// Yes, `createNode` creates a yoga node for all elements except `ink-virtual-text`.

	const instance = await renderTerminal(
		<StaticRender width={100} style={{paddingLeft: 2}}>
			{() => <Text>Indented</Text>}
		</StaticRender>,
		100,
		defaultTestConfig,
	);

	await instance.waitUntilReady();
	const output = instance.lastFrame().trimEnd();
	t.is(output, '  Indented');
	await instance.unmount();
});

test.serial(
	'StaticRender removes rendered children from the document',
	async t => {
		const trackedRef = React.createRef<DOMElement>();

		function Example() {
			return (
				<Box ref={trackedRef}>
					<StaticRender width={40}>
						{() => <Text>Static body</Text>}
					</StaticRender>
				</Box>
			);
		}

		const instance = await renderTerminal(<Example />, 40, defaultTestConfig);

		await instance.waitUntilReady();
		await waitFor(() => {
			const staticNode = trackedRef.current?.childNodes[0] as
				| DOMElement
				| undefined;
			return (
				Boolean(staticNode?.cachedRender) && staticNode.childNodes.length === 0
			);
		});

		const staticNode = trackedRef.current?.childNodes[0] as
			| DOMElement
			| undefined;
		t.is(staticNode?.nodeName, 'ink-static-render');
		t.truthy(staticNode?.cachedRender);
		t.is(staticNode?.childNodes.length, 0);

		await instance.unmount();
	},
);
