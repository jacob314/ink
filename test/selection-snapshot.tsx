/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {EventEmitter} from 'node:events';
import React from 'react';
import test from 'ava';
import {render} from '../src/index.js';
import Selection, {
	type SelectionReference,
} from '../examples/selection/selection.js';
import createStdout from './helpers/create-stdout.js';
import {waitFor} from './helpers/wait-for.js';

test('selection example renders correctly', async t => {
	const stdout = createStdout();
	const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
	stdin.isTTY = true;
	stdin.setRawMode = () => {};
	stdin.setEncoding = () => {};
	stdin.ref = () => {};
	stdin.unref = () => {};
	stdin.read = () => null;

	const ref = React.createRef<SelectionReference>();

	const {unmount} = render(<Selection ref={ref} />, {
		stdout,
		stdin,
		debug: true,
	});

	await waitFor(
		() =>
			!stdout.get().includes('Full Text Length: 0') &&
			(ref.current?.getSelectedText()?.length ?? 0) > 0,
	);

	t.snapshot(stdout.get());
	t.is(ref.current?.getSelectedText(), ref.current?.getSelectionToString());

	unmount();
});
