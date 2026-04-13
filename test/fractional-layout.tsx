import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('handles fractional layout values without crashing', t => {
	// A 50.5% width on a 33 width container yields 16.665.
	// If padding calculations use Math.round, this won't crash String.prototype.repeat.
	const output = renderToString(
		<Box width={33}>
			<Box width="50.5%" paddingLeft={1} paddingTop={1}>
				<Text>Fractional Layout</Text>
			</Box>
		</Box>,
	);

	t.snapshot(output);
});
