import React from 'react';
import {render} from '../../src/index.js';
import NestedStaticDemo from './nested-static.js';
import process from 'node:process';

const start = Date.now();
let frames = 0;

const {unmount} = render(React.createElement(NestedStaticDemo), {
	renderProcess: false,
	terminalBuffer: true,
	incrementalRendering: true,
	standardReactLayoutTiming: true,
	maxFps: 1000,
	debugRainbow: false,
});

const checkFps = setInterval(() => {
	frames++;
	if (frames >= 100) {
		const duration = Date.now() - start;
		console.log(`\nRendered 100 frames in ${duration}ms (${(duration / 100).toFixed(2)}ms per frame)`);
		unmount();
		// eslint-disable-next-line unicorn/no-process-exit
		process.exit(0);
	}
}, 16);
