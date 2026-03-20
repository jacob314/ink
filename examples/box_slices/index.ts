/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render} from '../../src/index.js';
import BoxSlices from './box-slices.js';

export const instance = render(React.createElement(BoxSlices), {
	renderProcess: true,
	terminalBuffer: true,
	alternateBuffer: false,
	standardReactLayoutTiming: true,
	incrementalRendering: true,
	animatedScroll: true,
	backbufferUpdateDelay: 100,
	maxFps: 10_000,
});
