import React from 'react';
import {render} from '../../src/index.js';
import NestedStaticDemo from './nested-static.js';
import process from 'node:process';
import {PassThrough} from 'node:stream';
import {Profiler} from '../../benchmark/utils/profiler.js';

const dummyStdout = new PassThrough();
(dummyStdout as any).columns = 80;
(dummyStdout as any).rows = 24;

const profiler = new Profiler();
await profiler.start();

const start = Date.now();
let frames = 0;

const {unmount} = render(React.createElement(NestedStaticDemo), {
	renderProcess: false,
	terminalBuffer: true,
	incrementalRendering: true,
	standardReactLayoutTiming: true,
	maxFps: 1000,
	debugRainbow: false,
	stdout: dummyStdout as NodeJS.WriteStream,
});

const checkFps = setInterval(async () => {
	frames++;
	if (frames >= 100) {
		const duration = Date.now() - start;
		console.log(
			`\nRendered 100 frames in ${duration}ms (${(duration / 100).toFixed(2)}ms per frame)`,
		);
		unmount();
		await profiler.stopAndSave('benchmark-worker.cpuprofile');
		// eslint-disable-next-line unicorn/no-process-exit
		process.exit(0);
	}
}, 16);
