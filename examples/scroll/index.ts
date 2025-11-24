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
	//alternateBuffer: true,
	standardReactLayoutTiming: true,
//	debugRainbow: true,
	incrementalRendering: true,
	maxFps: 10000,
});
