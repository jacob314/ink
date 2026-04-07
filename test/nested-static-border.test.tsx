/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import test from 'ava';
import React from 'react';
import {Box, Text, StaticRender} from '../src/index.js';
import {render} from './helpers/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OuterGroup = React.memo(({items}: {readonly items: number[]}) => {
	return (
		<StaticRender width={60}>
			<Box flexDirection="column" borderStyle="double" paddingX={1}>
				<Text>Outer Box</Text>
				{items.map(id => (
					<StaticRender key={id} width={40}>
						<Box borderStyle="single">
							<Text>Inner {id}</Text>
						</Box>
					</StaticRender>
				))}
			</Box>
		</StaticRender>
	);
});

function TestApp({items}: {readonly items: number[]}) {
	return (
		<Box flexDirection="column" width={80}>
			<OuterGroup items={items} />
		</Box>
	);
}

test('Nested StaticRender test', async t => {
	const columns = 80;
	const rows = 10;

	const {rerender, unmount, waitUntilReady, generateSvg} = await render(
		<TestApp items={[1]} />,
		columns,
		{
			terminalHeight: rows,
			terminalBuffer: true,
			renderProcess: false,
		},
	);

	await waitUntilReady();

	// Trigger update that clears cachedRender
	await rerender(<TestApp items={[1, 2]} />);
	await waitUntilReady();

	const svg = generateSvg();
	const snapshotPath = path.join(
		__dirname,
		'snapshots',
		'nested-static',
		'border-update.svg',
	);

	fs.mkdirSync(path.dirname(snapshotPath), {recursive: true});

	if (process.env['UPDATE_SNAPSHOTS'] ?? !fs.existsSync(snapshotPath)) {
		fs.writeFileSync(snapshotPath, svg, 'utf8');
		t.pass();
	} else {
		const expected = fs.readFileSync(snapshotPath, 'utf8');
		t.is(svg, expected);
	}

	await unmount();
});
