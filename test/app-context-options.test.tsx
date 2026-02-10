/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useContext, useEffect} from 'react';
import test from 'ava';
import {render, AppContext, Text} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('setOptions in AppContext triggers React rerender and updates options', t => {
	const stdout = createStdout();
	let renderCount = 0;
	let lastOptions: any;

	function Test() {
		const {options, setOptions} = useContext(AppContext);
		renderCount++;
		lastOptions = options;

		useEffect(() => {
			if (!options.isAlternateBufferEnabled) {
				setOptions({isAlternateBufferEnabled: true});
			}
		}, [options.isAlternateBufferEnabled, setOptions]);

		return <Text>{options.isAlternateBufferEnabled ? 'on' : 'off'}</Text>;
	}

	const {unmount} = render(<Test />, {
		stdout,
		isAlternateBufferEnabled: false,
	});

	// Initial render: off
	// After useEffect: setOptions called -> triggers rerender -> on
	t.is(renderCount, 2);
	t.true(lastOptions.isAlternateBufferEnabled);

	unmount();
});

test('setOptions updates optionsState from legacy alternateBuffer option', t => {
	const stdout = createStdout();
	let lastOptions: any;

	function Test() {
		const {options} = useContext(AppContext);
		lastOptions = options;
		return <Text>Hello</Text>;
	}

	const {unmount} = render(<Test />, {
		stdout,
		alternateBuffer: true,
	});

	t.true(lastOptions.isAlternateBufferEnabled);

	unmount();
});
