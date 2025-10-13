import React from 'react';
import {render} from '../../src/index.js';
import ScrollableContent from './scroll.js';

process.stdout.write('\x1b[?7l');

render(React.createElement(ScrollableContent), {alternateBuffer: true});
