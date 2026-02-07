import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('clipping - nested scrollable box inside hidden overflow box should be visible', t => {
	const output = renderToString(
		<Box paddingTop={10} paddingLeft={10}>
			<Box width={20} height={10} overflow="hidden">
				<Box width={10} height={1} overflow="scroll">
					<Text>VISIBLE</Text>
				</Box>
			</Box>
		</Box>,
	);

	const lines = output.split('\n');
    const visibleLine = lines[10];
	t.true(visibleLine?.includes('VISIBLE'), `Expected "VISIBLE" in line 10, got: ${JSON.stringify(visibleLine)}`);
});

test('clipping - content should be clipped by parent hidden overflow', t => {
	const output = renderToString(
		<Box width={5} height={1} overflow="hidden">
			<Box width={10} height={1} overflow="scroll">
				<Text>1234567890</Text>
			</Box>
		</Box>,
	);

    // Should only show "12345"
	t.is(output, '12345');
});

test('clipping - content should be clipped by nested hidden overflow', t => {
	const output = renderToString(
		<Box width={10} height={1} overflow="scroll">
			<Box width={5} height={1} overflow="hidden">
				<Text>1234567890</Text>
			</Box>
		</Box>,
	);

    // Should only show "12345"
	t.is(output, '12345');
});
