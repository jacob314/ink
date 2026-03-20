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
		columns: {
			type: 'string',
		},
		rows: {
			type: 'string',
		},
	},
});

const items = values.items ? Number.parseInt(values.items, 10) : undefined;
const scrollDown = values['scroll-down']
	? Number.parseInt(values['scroll-down'], 10)
	: undefined;
const columns = values.columns
	? Number.parseInt(values.columns, 10)
	: undefined;
const rows = values.rows ? Number.parseInt(values.rows, 10) : undefined;

const app = render(
	React.createElement(ScrollableContent, {
		itemCount: items,
		initialScrollTop: scrollDown,
		exportFilename: values.export,
		columns,
		rows,
	}),
	{
		renderProcess: true,
		terminalBuffer: true,
		alternateBuffer: false,
		standardReactLayoutTiming: true,
		incrementalRendering: true,
	},
);
