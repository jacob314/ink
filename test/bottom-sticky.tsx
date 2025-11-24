/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('bottom sticky header states', t => {
	const scenarios = [
		{
			scrollTop: 0,
			description: 'Header stuck at bottom initially',
		},
		{
			scrollTop: 5,
			description: 'Header still stuck at bottom after some scroll',
		},
		{
			scrollTop: 8,
			description: 'Header at its natural position (no longer stuck)',
		},
		{
			scrollTop: 10,
			description: 'Header scrolled out of view at the top',
		},
	];

	for (const {scrollTop, description} of scenarios) {
		const output = renderToString(
			<Box
				height={5}
				width={20}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<Box flexDirection="column" flexShrink={0}>
					<Text>Item 1</Text>
					<Text>Item 2</Text>
					<Text>Item 3</Text>
					<Text>Item 4</Text>
					<Text>Item 5</Text>
					<Text>Item 6</Text>
					<Text>Item 7</Text>
					<Text>Item 8</Text>
					<Box sticky="bottom" opaque width="100%">
						<Text>Sticky Footer</Text>
					</Box>
					<Text>Item 9</Text>
					<Text>Item 10</Text>
					<Text>Item 11</Text>
					<Text>Item 12</Text>
				</Box>
			</Box>,
		);

		t.snapshot(output, `scrollTop: ${scrollTop} - ${description}`);
	}
});
