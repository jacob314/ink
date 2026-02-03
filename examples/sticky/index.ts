/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render} from '../../src/index.js';
import ScrollableContent from './sticky.js';

render(React.createElement(ScrollableContent), {
	renderProcess: true,
	terminalBuffer: true,
	alternateBuffer: false,
	standardReactLayoutTiming: true,
	debugRainbow: true,
	incrementalRendering: true,
	maxFps: 10_000,
});
