/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render} from '../../src/index.js';
import Example from './static-render.js';

render(React.createElement(Example), {renderProcess: true});
