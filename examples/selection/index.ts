/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render} from '../../src/index.js';
import Selection, {selectionStyle} from './selection.js';

render(React.createElement(Selection), {
	exitOnCtrlC: true,
	selectionStyle,
});
