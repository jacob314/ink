/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React from 'react';
import {render} from '../../src/index.js';
import Selection, {selectionStyle} from './selection.js';

const useStaticRender = process.argv.includes('--static');

render(React.createElement(Selection, {useStaticRender}), {
	exitOnCtrlC: true,
	renderProcess: true,
	terminalBuffer: true,
	alternateBuffer: false,
	standardReactLayoutTiming: true,
	selectionStyle,
	trackSelection: true,
});
