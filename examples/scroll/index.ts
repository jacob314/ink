/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import {parseArgs} from 'node:util';
import React from 'react';
import {render} from '../../src/index.js';
import ScrollableContent from './scroll.js';

const {values} = parseArgs({
	args: process.argv.slice(2),
	options: {
		export: {
			type: 'string',
		},
		items: {
			type: 'string',
		},
		'scroll-down': {
			type: 'string',
		},
	},
});

const items = values.items ? Number.parseInt(values.items, 10) : undefined;
const scrollDown = values['scroll-down']
	? Number.parseInt(values['scroll-down'], 10)
	: undefined;

const app = render(
	React.createElement(ScrollableContent, {
		itemCount: items,
		initialScrollTop: scrollDown,
		exportFilename: values.export,
	}),
	{
		renderProcess: true,
		terminalBuffer: true,
		alternateBuffer: false,
		standardReactLayoutTiming: true,
		incrementalRendering: true,
	},
);
