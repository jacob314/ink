import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('nested Text: wrapped lines are not truncated after per-line child offset', t => {
	const chunk =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const message = chunk.repeat(3);
	const output = renderToString(
		<Box flexDirection="row">
			<Box width={1}>
				<Text>#</Text>
			</Box>
			<Box flexDirection="column">
				<Text wrap="wrap">{message}</Text>
			</Box>
		</Box>,
		{columns: 20},
	);
	console.log(output);

	t.is(
		output.replaceAll(/\s/g, '').slice(1), // Remove the leading '#' character
		message,
		'every character of the message must appear in the output without truncation',
	);
});
