/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {act} from 'react';
import test from 'ava';
import stripAnsi from 'strip-ansi';
import Selection, {
	type SelectionReference,
	selectionStyle,
} from '../examples/selection/selection.js';
import {type RenderOptions} from '../src/index.js';
import {render} from './helpers/render.js';
import {waitFor} from './helpers/wait-for.js';

test('selection example renders correctly', async t => {
	const ref = React.createRef<SelectionReference>();

	const {unmount, generateSvg, lastFrame, stdin, waitUntilReady} = render(
		<Selection ref={ref} />,
		100,
		{
			terminalBuffer: true,
			selectionStyle,
		},
	);

	await waitUntilReady();

	await waitFor(
		() =>
			!stripAnsi(lastFrame({allowEmpty: true})).includes('Full Text Length: 0'),
		5000,
	);

	let firstLength = ref.current?.getSelectedText()?.length ?? 0;

	act(() => {
		// select character 's'
		stdin.write('s');
		stdin.write('\u001B[1;2C'); // shift-right
		stdin.write('\u001B[1;2C'); // shift-right
		stdin.write('\u001B[1;2C'); // shift-right
		stdin.write('\u001B[1;2B'); // shift-down
	});

	await new Promise(resolve => setTimeout(resolve, 100));

	const fs = await import('node:fs/promises');
	const path = await import('node:path');
	const url = await import('node:url');
	const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

	const outDir = path.join(__dirname, 'snapshots', 'selection-snapshot');
	await fs.mkdir(outDir, {recursive: true});

	const svg1 = generateSvg();
	await fs.writeFile(path.join(outDir, 'selection-initial.svg'), svg1, 'utf8');
	t.is(ref.current?.getSelectedText(), ref.current?.getSelectionToString());

	act(() => {
		// Toggle static render mode
		stdin.write('m');
	});

	await waitFor(
		() => stripAnsi(lastFrame({allowEmpty: true})).includes('ON'),
		5000,
	);

	act(() => {
		// Reset anchor first
		stdin.write('r');
	});
	
	await new Promise(resolve => {
		setTimeout(resolve, 50);
	});

	// Select next character inside static render mode by moving right then selecting
	act(() => {
		stdin.write('s');
		stdin.write('\u001B[1;2C'); // Shift-right
		stdin.write('\u001B[1;2C'); // Shift-right
		stdin.write('\u001B[1;2B'); // Shift-down
	});

	await new Promise(resolve => setTimeout(resolve, 100));

	const svg2 = generateSvg();
	await fs.writeFile(
		path.join(outDir, 'selection-static-render.svg'),
		svg2,
		'utf8',
	);
	t.is(ref.current?.getSelectedText(), ref.current?.getSelectionToString());

	unmount();
});
