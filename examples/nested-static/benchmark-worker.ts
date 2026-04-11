import React from 'react';
import {render} from '../../src/index.js';
import NestedStaticDemo from './nested-static.js';
import process from 'node:process';

const start = Date.now();
const {unmount} = render(React.createElement(NestedStaticDemo), {
	renderProcess: false,
	terminalBuffer: true,
	incrementalRendering: true,
	standardReactLayoutTiming: true,
	maxFps: 1000,
	debugRainbow: false,
});

setTimeout(() => {
	console.log(`Ran for ${Date.now() - start}ms`);
	unmount();
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(0);
}, 2000);
