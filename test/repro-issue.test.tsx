import test from 'ava';
import React from 'react';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/scroll/scroll.tsx';
import createStdout from './helpers/create-stdout.js';
import delay from 'delay';

test('scrollbar is shown on the first frame in ScrollableContent example', async t => {
	const stdout = createStdout(80);

	render(
		<ScrollableContent columns={80} rows={20} itemCount={100} />,
		{
			stdout: stdout as any,
			debugRainbow: false,
			terminalBuffer: true,
            renderProcess: false,
		}
	);

    // We want to check the VERY FIRST write to stdout.
    // createStdout.write is a spy.
    
    // Wait a tiny bit to ensure the worker has had a chance to render the first frame
    await delay(100);

    const firstWrite = (stdout.write as any).firstCall?.args[0];
    t.truthy(firstWrite, 'Should have written at least one frame');
    
    t.log('First write length:', firstWrite.length);
    
    // Check if scrollbar character is present in the first frame
	const hasScrollbar = firstWrite.includes('█') || firstWrite.includes('▀') || firstWrite.includes('▄');
    
    if (!hasScrollbar) {
        t.log('First frame output:', JSON.stringify(firstWrite));
    }
    
	t.true(hasScrollbar, 'First frame should contain vertical scrollbar');
});