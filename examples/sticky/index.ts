/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React from 'react';
import {render} from '../../src/index.js';
import ScrollableContent from './sticky.js';

const arguments_ = process.argv.slice(2);
const useStatic = !arguments_.includes('--no-static');

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

let recordFilename = '';
const recordIndex = arguments_.indexOf('--record');
if (recordIndex !== -1) {
	if (
		arguments_.length > recordIndex + 1 &&
		!arguments_[recordIndex + 1]!.startsWith('--')
	) {
		recordFilename = arguments_[recordIndex + 1]!;
	} else {
		recordFilename = 'recording.json';
	}
}

let initialItems = 0;
const itemsToAddIndex = arguments_.indexOf('--items');
if (itemsToAddIndex !== -1 && arguments_.length > itemsToAddIndex + 1) {
	initialItems = Number.parseInt(arguments_[itemsToAddIndex + 1]!, 10);
	if (Number.isNaN(initialItems)) {
		initialItems = 0;
	}
}

let initialScroll = 0;
const scrollDownIndex = arguments_.indexOf('--scroll-down');
if (scrollDownIndex !== -1 && arguments_.length > scrollDownIndex + 1) {
	initialScroll = Number.parseInt(arguments_[scrollDownIndex + 1]!, 10);
	if (Number.isNaN(initialScroll)) {
		initialScroll = 0;
	}
}

let columns: number | undefined;
const columnsIndex = arguments_.indexOf('--columns');
if (columnsIndex !== -1 && arguments_.length > columnsIndex + 1) {
	columns = Number.parseInt(arguments_[columnsIndex + 1]!, 10);
	if (Number.isNaN(columns)) {
		columns = undefined;
	}
}

let rows: number | undefined;
const rowsIndex = arguments_.indexOf('--rows');
if (rowsIndex !== -1 && arguments_.length > rowsIndex + 1) {
	rows = Number.parseInt(arguments_[rowsIndex + 1]!, 10);
	if (Number.isNaN(rows)) {
		rows = undefined;
	}
}

export const instance = render(
	React.createElement(ScrollableContent, {
		useStatic,
		initialItems,
		initialScroll,
		exportFilename,
		recordFilename,
		columns,
		rows,
	}),
	{
		debugRainbow: true,
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
