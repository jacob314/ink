/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'ava';
import React from 'react';
import {Box, Text, StaticRender} from '../src/index.js';
import {render} from './helpers/render.js';
import {verifySvgSnapshot} from './helpers/svg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OuterGroup = React.memo(({items}: {readonly items: number[]}) => {
	return (
		<StaticRender width={60}>
			{() => (
				<Box flexDirection="column" borderStyle="double" paddingX={1}>
					<Text>Outer Box</Text>
					{items.map(id => (
						<StaticRender key={id} width={40}>
							{() => (
								<Box borderStyle="single">
									<Text>Inner {id}</Text>
								</Box>
							)}
						</StaticRender>
					))}
				</Box>
			)}
		</StaticRender>
	);
});

function TestApp({itemCount}: {readonly itemCount: number}) {
	const items = Array.from({length: itemCount}).map((_, i) => i + 1);

	const expectedHeight = 2 + 3 * itemCount;
	const scrollTop = Math.max(0, expectedHeight - 10);

	return (
		<Box flexDirection="column" width={80} height={10}>
			<Box
				overflowToBackbuffer
				overflowY="scroll"
				flexDirection="column"
				flexGrow={1}
				scrollbar={false}
				scrollTop={scrollTop}
			>
				<OuterGroup items={items} />
			</Box>
		</Box>
	);
}

test('Multiple additions to nested StaticRender do not leave gaps', async t => {
	const columns = 80;
	const rows = 10;

	const {rerender, unmount, waitUntilReady, generateSvg} = await render(
		<TestApp itemCount={1} />,
		columns,
		{
			terminalHeight: rows,
			terminalBuffer: true,
			renderProcess: false,
			standardReactLayoutTiming: false,
			maxFps: 1000,
		},
	);

	await waitUntilReady();

	for (let i = 2; i <= 5; i++) {
		// eslint-disable-next-line no-await-in-loop
		await rerender(<TestApp itemCount={i} />);
		// eslint-disable-next-line no-await-in-loop
		await waitUntilReady();
	}

	const svg = generateSvg();
	const snapshotPath = path.join(
		__dirname,
		'snapshots',
		'nested-static',
		'gap-update.svg',
	);

	verifySvgSnapshot(t, svg, snapshotPath);

	await unmount();
});
