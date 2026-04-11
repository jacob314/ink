import test from 'ava';
import React from 'react';
import {render, Box, Text, StaticRender} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('debug static render inside scroll container', t => {
	try {
		const out1 = renderToString(
			<Box
				height={10}
				width={50}
				overflowY="scroll"
				scrollTop={0}
				borderStyle="single"
			>
				<Box flexDirection="column">
					<StaticRender width={48}>
						{() => (
							<Box flexDirection="column">
								<Box key="s1" opaque sticky="top" height={1}>
									<Text>HEADER 1</Text>
								</Box>
								<Text>Item 1 Line 1</Text>
								<Text>Item 1 Line 2</Text>
								<Text>Item 1 Line 3</Text>
							</Box>
						)}
					</StaticRender>
					<StaticRender width={48}>
						{() => (
							<Box flexDirection="column">
								<Box key="s2" opaque sticky="top" height={1}>
									<Text>HEADER 2</Text>
								</Box>
								<Text>Item 2 Line 1</Text>
								<Text>Item 2 Line 2</Text>
								<Text>Item 2 Line 3</Text>
								<Text>Item 2 Line 4</Text>
								<Text>Item 2 Line 5</Text>
							</Box>
						)}
					</StaticRender>
				</Box>
			</Box>,
		);

		const out2 = renderToString(
			<Box
				height={10}
				width={50}
				overflowY="scroll"
				scrollTop={5}
				borderStyle="single"
			>
				<Box flexDirection="column">
					<StaticRender width={48}>
						{() => (
							<Box flexDirection="column">
								<Box key="s1" opaque sticky="top" height={1}>
									<Text>HEADER 1</Text>
								</Box>
								<Text>Item 1 Line 1</Text>
								<Text>Item 1 Line 2</Text>
								<Text>Item 1 Line 3</Text>
							</Box>
						)}
					</StaticRender>
					<StaticRender width={48}>
						{() => (
							<Box flexDirection="column">
								<Box key="s2" opaque sticky="top" height={1}>
									<Text>HEADER 2</Text>
								</Box>
								<Text>Item 2 Line 1</Text>
								<Text>Item 2 Line 2</Text>
								<Text>Item 2 Line 3</Text>
								<Text>Item 2 Line 4</Text>
								<Text>Item 2 Line 5</Text>
							</Box>
						)}
					</StaticRender>
				</Box>
			</Box>,
		);
		t.pass();
	} catch {
		t.fail();
	}
});
