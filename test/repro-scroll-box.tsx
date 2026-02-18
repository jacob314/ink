import test from 'ava';
import React from 'react';
import {render, Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('debug standard scroll container clipping', t => {
	try {
		const out2 = renderToString(
			<Box
				height={5}
				width={20}
				overflowY="scroll"
				scrollTop={3}
				borderStyle="single"
			>
				<Box flexDirection="column" flexShrink={0}>
					{Array.from({length: 7}).map((_, i) => (
						<Box key={`Line ${i + 1}`} flexShrink={0}>
							<Text>Line {i + 1}</Text>
						</Box>
					))}
				</Box>
			</Box>,
		);
		console.log('OUT2 (scrollTop=3):\n' + out2);
		t.pass();
	} catch (error: unknown) {
		console.error(error);
		t.fail();
	}
});
