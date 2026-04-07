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
import {StaticRender, Text, Box} from '../src/index.js';
import {render} from './helpers/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Nested StaticRender elements render correctly', async t => {
	const columns = 100;
	const rows = 10;

	const {unmount, waitUntilReady, generateSvg} = await render(
		<StaticRender width={100}>
			<Box flexDirection="column">
				<Text>Outer text</Text>
				<StaticRender width={50}>
					<Text>Inner text</Text>
				</StaticRender>
			</Box>
		</StaticRender>,
		columns,
		{
			terminalHeight: rows,
			terminalBuffer: true,
			renderProcess: false,
		},
	);

	await waitUntilReady();

	const svg = generateSvg();
	const snapshotPath = path.join(
		__dirname,
		'snapshots',
		'nested-static',
		'simple-nested.svg',
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
