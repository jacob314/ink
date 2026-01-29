/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render} from '../../src/index.js';
import ScrollableContent from './scroll.js';

render(React.createElement(ScrollableContent), {
	renderProcess: true,
	terminalBuffer: true,
	isAlternateBufferEnabled: false,
	// AlternateBuffer: true,
	standardReactLayoutTiming: true,
	debugRainbow: false,
	incrementalRendering: true,
	maxFps: 10_000,
});
