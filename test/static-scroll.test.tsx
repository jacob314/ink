import test from 'ava';
import React from 'react';
import stripAnsi from 'strip-ansi';
import delay from 'delay';
import {StaticRender, Text, Box, render} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('StaticRender captures content of scrollable boxes', async t => {
	const stdout = createStdout();
	const {unmount} = render(
		<StaticRender width={100}>
			<Box height={2} overflowY="scroll">
				<Text>Line 1</Text>
				<Text>Line 2</Text>
				<Text>Line 3</Text>
			</Box>
		</StaticRender>,
		{stdout},
	);

	await delay(100);

	const output = stripAnsi(stdout.get());
	t.log('Output:', output);
	t.true(output.includes('Line 1'), 'Output should include Line 1');
	t.true(output.includes('Line 2'), 'Output should include Line 2');
	unmount();
});
