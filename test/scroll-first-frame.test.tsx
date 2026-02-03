
import test from 'ava';
import React from 'react';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/scroll/scroll.tsx';
import createStdout from './helpers/create-stdout.js';
import delay from 'delay';

test('scrollbar is shown on the VERY first frame in ScrollableContent', async t => {
	const stdout = createStdout(80);

    // We want to capture the very first write.
    // We'll use a custom stdout that tracks calls.
    let firstFrame = '';
    const originalWrite = stdout.write.bind(stdout);
    stdout.write = (chunk: string) => {
        if (!firstFrame) {
            firstFrame = chunk;
        }
        return originalWrite(chunk);
    };

	render(
		<ScrollableContent columns={80} rows={20} itemCount={100} />,
		{
			stdout: stdout as any,
			debugRainbow: false,
			terminalBuffer: true,
            renderProcess: false,
		}
	);

    // Wait a tiny bit
    await delay(100);

    t.truthy(firstFrame, 'Should have written at least one frame');
    
    // Check if scrollbar character is present in the first frame
	const hasScrollbar = firstFrame.includes('█') || firstFrame.includes('▀') || firstFrame.includes('▄');
    
    if (!hasScrollbar) {
        t.log('First frame output:', JSON.stringify(firstFrame));
    }
    
	t.true(hasScrollbar, 'First frame should contain vertical scrollbar');
});
