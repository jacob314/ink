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
	alternateBuffer: false,
	standardReactLayoutTiming: true,
	debugRainbow: true,
	incrementalRendering: true,
	backbufferUpdateDelay: 100,
	maxFps: 10_000,
});
