/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React from 'react';
import {render} from '../../src/index.js';
import ScrollableContent from './scroll-blue-background.js';

const arguments_ = process.argv.slice(2);

let exportFilename = '';
const exportIndex = arguments_.indexOf('--export');
if (exportIndex !== -1) {
	if (
		arguments_.length > exportIndex + 1 &&
		!arguments_[exportIndex + 1]!.startsWith('--')
	) {
		exportFilename = arguments_[exportIndex + 1]!;
	} else {
		exportFilename = 'snapshot.json';
	}
}

export const instance = render(
	React.createElement(ScrollableContent, {
		exportFilename,
	}),
	{
		renderProcess: true,
		terminalBuffer: true,
		alternateBuffer: false,
		standardReactLayoutTiming: true,
		incrementalRendering: true,
		animatedScroll: true,
		backbufferUpdateDelay: 100,
		maxFps: 10_000,
	},
);
