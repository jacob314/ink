import test from 'ava';
import React from 'react';
import delay from 'delay';
import {Box, Text, render} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';
import createStdout from './helpers/create-stdout.js';
import {enableTestColors, disableTestColors} from './helpers/force-colors.js';

test.before(() => {
	enableTestColors();
});

test.after(() => {
	disableTestColors();
});

test('scrollbar is shown on the first frame', async t => {
	const stdout = createStdout();

	render(
		<Box width={20} height={5} overflowY="scroll">
			<Box height={10} flexDirection="column" flexShrink={0}>
				<Text>Line 1</Text>
				<Text>Line 2</Text>
				<Text>Line 3</Text>
				<Text>Line 4</Text>
				<Text>Line 5</Text>
				<Text>Line 6</Text>
				<Text>Line 7</Text>
				<Text>Line 8</Text>
				<Text>Line 9</Text>
				<Text>Line 10</Text>
			</Box>
		</Box>,
		{
			stdout: stdout as any,
			debugRainbow: false,
			terminalBuffer: true,
			renderProcess: false, // Run in same process for test
		},
	);

	// Wait a bit for the worker to process the first frame
	await delay(100);

	const output = stdout.get();

	t.log('Output length:', output.length);
	t.log('Output:', JSON.stringify(output));

	t.true(
		output.includes('█') || output.includes('▀') || output.includes('▄'),
		'Output should contain vertical scrollbar',
	);
});
