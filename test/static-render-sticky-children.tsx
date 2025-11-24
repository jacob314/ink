import React from 'react';
import test from 'ava';
import {Box, Text, StaticRender} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('StaticRender with stickyChildren (different height)', t => {
	const scenarios = [
		{
			name: 'initial',
			scrollTop: 0,
			description: 'Header naturally at top',
		},
		{
			name: 'stuck',
			scrollTop: 1,
			description: 'Sticky header (taller) stuck to top',
		},
	];

	for (const {name, scrollTop, description} of scenarios) {
		const output = renderToString(
			<Box
				height={10}
				width={30}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<StaticRender width={30}>
					<Box flexDirection="column">
						<Box height={5} flexDirection="column">
							<Box
								opaque
								sticky
								stickyChildren={
									<Box opaque flexDirection="column">
										<Text>STICKY HEADER LINE 1</Text>
										<Text>STICKY HEADER LINE 2</Text>
									</Box>
								}
							>
								<Text>Normal Header</Text>
							</Box>
							<Text>Item 1</Text>
							<Text>Item 2</Text>
							<Text>Item 3</Text>
						</Box>
						<Text>End of list</Text>
					</Box>
				</StaticRender>
			</Box>,
		);

		t.snapshot(output, `${name} (scrollTop: ${scrollTop}) - ${description}`);
	}
});
