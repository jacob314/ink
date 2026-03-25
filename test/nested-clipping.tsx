import React from 'react';
import test from 'ava';
import stripAnsi from 'strip-ansi';
import {Box, Text} from '../src/index.js';
import {render} from './helpers/render.js';

test('nested clipping - content inside deeply nested scrollable should be rendered with terminalBuffer', async t => {
	const {lastFrame, waitUntilReady, unmount} = await render(
		<Box flexDirection="column" height={10} width={40}>
			<Box height={5} width={40} overflow="hidden">
				<Box height={10} width={40} overflowY="scroll" flexDirection="column">
					<Text>Visible 1</Text>
					<Text>Visible 2</Text>
					<Text>Visible 3</Text>
					<Text>Visible 4</Text>
					<Text>Visible 5</Text>
					<Text>Hidden 6</Text>
					<Text>Hidden 7</Text>
				</Box>
			</Box>
		</Box>,
		40,
		{
			terminalBuffer: true,
			terminalHeight: 10,
		},
	);

	await waitUntilReady();
	const content = stripAnsi(lastFrame());
	t.true(content.includes('Visible 1'), 'Visible 1 should be rendered');
	t.true(content.includes('Visible 5'), 'Visible 5 should be rendered');
	t.false(content.includes('Hidden 6'), 'Hidden 6 should be clipped');
	t.false(content.includes('Hidden 7'), 'Hidden 7 should be clipped');

	await unmount();
});
