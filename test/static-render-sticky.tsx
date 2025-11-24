import React from 'react';
import test from 'ava';
import {Box, Text, StaticRender} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('StaticRender with sticky header', t => {
	const scenarios = [
		{
			name: 'initial',
			scrollTop: 0,
			description: 'Header naturally at top',
		},
		{
			name: 'stuck',
			scrollTop: 1,
			description: 'Header stuck to viewport top',
		},
		{
			name: 'scrolled_past',
			scrollTop: 5,
			description: 'Header scrolled out with its parent section',
		},
	];

	for (const {name, scrollTop, description} of scenarios) {
		const output = renderToString(
			<Box
				height={5}
				width={20}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<StaticRender width={20}>
					<Box flexDirection="column">
						<Box height={4} flexDirection="column">
							<Box sticky opaque>
								<Text>Header</Text>
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

test('StaticRender containing multiple sticky headers', t => {
	const scenarios = [
		{
			name: 'H1 stuck',
			scrollTop: 1,
		},
		{
			name: 'H1 pushed by H2',
			scrollTop: 3,
		},
		{
			name: 'H2 stuck',
			scrollTop: 5,
		},
	];

	for (const {name, scrollTop} of scenarios) {
		const output = renderToString(
			<Box
				height={3}
				width={20}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<StaticRender width={20}>
					<Box flexDirection="column">
						<Box height={4} flexDirection="column">
							<Box sticky opaque>
								<Text>Header 1</Text>
							</Box>
							<Text>Item 1-1</Text>
							<Text>Item 1-2</Text>
							<Text>Item 1-3</Text>
						</Box>
						<Box height={4} flexDirection="column">
							<Box sticky opaque>
								<Text>Header 2</Text>
							</Box>
							<Text>Item 2-1</Text>
							<Text>Item 2-2</Text>
							<Text>Item 2-3</Text>
						</Box>
					</Box>
				</StaticRender>
			</Box>,
		);

		t.snapshot(output, `${name} (scrollTop: ${scrollTop})`);
	}
});

test('StaticRender with multi-line sticky header', t => {
	const output = renderToString(
		<Box
			height={10}
			width={20}
			overflowY="scroll"
			flexDirection="column"
			scrollTop={5}
		>
			<StaticRender width={20}>
				<Box flexDirection="column">
					<Box
						sticky
						opaque
						width="100%"
						stickyChildren={
							<Box flexDirection="column" width="100%">
								<Text>STICKY LINE 1</Text>
								<Text>STICKY LINE 2</Text>
							</Box>
						}
					>
						<Text>Normal Header</Text>
					</Box>
					{Array.from({length: 20}).map((_, i) => {
						const text = `Line ${i}`;
						return <Text key={text}>{text}</Text>;
					})}
				</Box>
			</StaticRender>
		</Box>,
	);

	t.snapshot(output);
});
