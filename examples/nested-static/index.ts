/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render} from '../../src/index.js';
import NestedStaticDemo from './nested-static.js';

render(React.createElement(NestedStaticDemo), {
	renderProcess: false,
	terminalBuffer: true,
	incrementalRendering: true,
	standardReactLayoutTiming: true,
	maxFps: 1000,
	debugRainbow: true,
	stickyHeadersInBackbuffer: true,
});
