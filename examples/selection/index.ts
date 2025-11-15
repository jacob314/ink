import React from 'react';
import {render} from '../../src/index.js';
import Selection, {selectionStyle} from './selection.js';

render(React.createElement(Selection), {
	exitOnCtrlC: true,
	selectionStyle,
});
