/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {render} from './helpers/render.js';

test('nested scrollable sticky header position', async t => {
	const columns = 100;
	const rows = 40;

	const {unmount, lastFrame, waitUntilReady} = await render(
		<Box flexDirection="column" width={columns} height={rows}>
			{Array.from({length: 10}).map((_, i) => (
				// eslint-disable-next-line react/no-array-index-key
				<Text key={i}>Spacer Line {i}</Text>
			))}
			<Box
				height={10}
				width={50}
				overflowY="scroll"
				scrollTop={5}
				borderStyle="single"
			>
				<Box flexDirection="column" flexShrink={0}>
					<Box
						key="sticky"
						sticky
						opaque
						height={1}
						width={50}
						stickyChildren={<Text>STICKY HEADER</Text>}
					>
						<Box height={1} width={50} />
					</Box>
					{Array.from({length: 50}).map((_, i) => (
						// eslint-disable-next-line react/no-array-index-key
						<Text key={i}>Line {i + 1}</Text>
					))}
				</Box>
			</Box>
		</Box>,
		columns,
		{
			terminalHeight: rows,
			terminalBuffer: true,
		},
	);

	await waitUntilReady();

	const output = lastFrame();
	const lines = output.split('\n');
	t.log('Full Output:\n' + lines.map((l, i) => `${i}: ${l}`).join('\n'));

	const foundRow = lines.findIndex(line => line.includes('│Line 6'));
	t.is(foundRow, 11, `│Line 6 should be at row 11, found at ${foundRow}`);

	await unmount();
});
