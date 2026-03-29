/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import React, {act} from 'react';
import test from 'ava';
import chalk from 'chalk';
import Selection, {
	type SelectionReference,
} from '../examples/selection/selection.js';
import {render} from './helpers/render.js';
import {waitFor} from './helpers/wait-for.js';

process.env['FORCE_COLOR'] = '3';
chalk.level = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.serial('selection example renders correctly', async t => {
	const ref = React.createRef<SelectionReference>();

	const {unmount, generateSvg, waitUntilReady} = await render(
		<Selection ref={ref} />,
		40,
		{
			terminalHeight: 60,
		},
	);

	await waitUntilReady();

	const svg = generateSvg();
	const snapshotPath = path.join(
		__dirname,
		'snapshots',
		'selection-snapshot',
		'selection-initial.svg',
	);

	// In normal test runs, we compare against the existing snapshot.
	// If the snapshot doesn't exist, we write it (useful for first-time creation).
	if (process.env['UPDATE_SNAPSHOTS'] ?? !fs.existsSync(snapshotPath)) {
		fs.writeFileSync(snapshotPath, svg, 'utf8');
		t.pass();
	} else {
		const expected = fs.readFileSync(snapshotPath, 'utf8');
		t.is(svg, expected);
	}

	t.is(ref.current?.getSelectedText(), ref.current?.getSelectionToString());

	await unmount();
});

// eslint-disable-next-line ava/no-skip-test
test.serial.skip(
	'selection with StaticRender example renders correctly',
	async t => {
		const ref = React.createRef<SelectionReference>();

		const {unmount, generateSvg, waitUntilReady} = await render(
			<Selection ref={ref} useStaticRender />,
			40,
			{
				terminalHeight: 60,
			},
		);

		// Wait for the render helper to settle its own queues
		await waitUntilReady();

		const svg = generateSvg();
		const snapshotPath = path.join(
			__dirname,
			'snapshots',
			'selection-snapshot',
			'selection-static-render.svg',
		);

		if (process.env['UPDATE_SNAPSHOTS'] ?? !fs.existsSync(snapshotPath)) {
			fs.writeFileSync(snapshotPath, svg, 'utf8');
			t.pass();
		} else {
			const expected = fs.readFileSync(snapshotPath, 'utf8');
			t.is(svg, expected);
		}

		await unmount();
	},
);
