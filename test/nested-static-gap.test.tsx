/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
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

const ExampleInnerStatic = React.memo(({id}: {readonly id: number}) => (
	<StaticRender width={50} deps={[id]}>
		{() => (
			<Box flexDirection="column" borderStyle="single" paddingX={1}>
				<Text>Inner Item {id}</Text>
				<Text>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
					eiusmod tempor incididunt ut labore et dolore magna aliqua.
				</Text>
				{id === 1 && (
					<Box marginTop={1}>
						<StaticRender width={44} deps={[]}>
							{() => (
								<Box flexDirection="column" borderStyle="round" paddingX={1}>
									<Text>Nested Item 1</Text>
									<Text>Nested Item 2</Text>
									<Text>Nested Item 3</Text>
								</Box>
							)}
						</StaticRender>
					</Box>
				)}
			</Box>
		)}
	</StaticRender>
));

function ExampleLikeApp({
	itemCount,
	columns,
	rows,
}: {
	readonly itemCount: number;
	readonly columns: number;
	readonly rows: number;
}) {
	const items = Array.from({length: itemCount}, (_, i) => i + 1);

	return (
		<Box flexDirection="column" height={rows} width={columns}>
			<Box
				overflowToBackbuffer
				scrollbar
				flexDirection="column"
				flexGrow={1}
				flexShrink={1}
				overflowX="hidden"
				overflowY="scroll"
				scrollTop={Number.MAX_SAFE_INTEGER}
				width={columns}
			>
				<Box flexShrink={0} flexDirection="column">
					<Box width={60} flexDirection="column" marginBottom={1} paddingX={1}>
						<Box flexDirection="column" gap={1} marginBottom={1}>
							{items.map(id => (
								<ExampleInnerStatic key={id} id={id} />
							))}
						</Box>

						<Text>Outer Group 1</Text>
					</Box>
				</Box>
			</Box>

			<Box borderTop borderStyle="single" flexDirection="column" flexShrink={0}>
				<Text>Nested StaticRender Demo</Text>
				<Text>Footer</Text>
			</Box>
		</Box>
	);
}

test('example-like nested StaticRender fills terminal scrollback on initial bottom scroll', async t => {
	const columns = 80;
	const rows = 12;

	const {unmount, waitUntilReady, terminal} = await render(
		<ExampleLikeApp itemCount={80} columns={columns} rows={rows} />,
		columns,
		{
			terminalHeight: rows,
			terminalBuffer: true,
			renderProcess: false,
			incrementalRendering: true,
			standardReactLayoutTiming: true,
			maxFps: 1000,
		},
	);

	await waitUntilReady();

	t.true(
		terminal.buffer.active.baseY > 0,
		'initial render should populate xterm scrollback',
	);

	const scrollbackLines = Array.from(
		{length: terminal.buffer.active.baseY},
		(_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) ?? '',
	);

	t.true(
		scrollbackLines.some(line => line.includes('Inner Item')),
		'scrollback should include nested StaticRender content',
	);

	await unmount();
});

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
