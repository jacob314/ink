/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'ava';
import React from 'react';
import stripAnsi from 'strip-ansi';
import type {SinonStub} from 'sinon';
import {StaticRender, Text, Box, render} from '../src/index.js';
import {waitFor} from './helpers/wait-for.js';
import createStdout from './helpers/create-stdout.js';

test('StaticRender renders children', async t => {
	const stdout = createStdout();
	const {unmount} = render(
		<StaticRender width={100}>
			<Text>Hello Static</Text>
		</StaticRender>,
		{stdout},
	);

	const write = stdout.write as unknown as SinonStub;
	await waitFor(() => write.callCount > 0);

	t.log('Call count:', write.callCount);
	const output = stripAnsi((write.lastCall?.args[0] as string) || '');
	t.is(output.trim(), 'Hello Static');
	unmount();
});

test('StaticRender with Box and multiple children', async t => {
	const stdout = createStdout();
	const {unmount} = render(
		<StaticRender width={100}>
			<Box flexDirection="column">
				<Text>Line 1</Text>
				<Text>Line 2</Text>
			</Box>
		</StaticRender>,
		{stdout},
	);

	const write = stdout.write as unknown as SinonStub;
	await waitFor(() => write.callCount > 0);

	const output = stripAnsi(write.lastCall.args[0] as string);
	t.is(
		output.trim(),
		`Line 1
Line 2`,
	);
	unmount();
});

test('StaticRender respects style prop', async t => {
	// This test verifies that we can style the container of StaticRender (e.g. padding)
	// The <ink-static-render> element should accept styles.
	// In my implementation, I passed `style` to `<ink-static-render>`.
	// And `src/dom.ts` defines `ink-static-render` in ElementNames.
	// `src/styles.ts` applies styles to yoga nodes.
	// But `ink-static-render` node has a yoga node?
	// Yes, `createNode` creates a yoga node for all elements except `ink-virtual-text`.

	const stdout = createStdout();
	const {unmount} = render(
		<StaticRender width={100} style={{paddingLeft: 2}}>
			<Text>Indented</Text>
		</StaticRender>,
		{stdout},
	);

	const write = stdout.write as unknown as SinonStub;
	await waitFor(() => write.callCount > 0);

	const output = stripAnsi(write.lastCall.args[0] as string).trimEnd();
	t.is(output, '  Indented');
	unmount();
});
