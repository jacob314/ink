import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('basic sticky header', t => {
	const output = renderToString(
		<Box height={4} overflowY="scroll" flexDirection="column" scrollTop={2}>
			<Box sticky>
				<Text>Header</Text>
			</Box>
			<Text>Item 1</Text>
			<Text>Item 2</Text>
			<Text>Item 3</Text>
			<Text>Item 4</Text>
		</Box>,
	);

	t.snapshot(output);
});

test('sticky header pushes previous one out', t => {
	const scrollTopPositions = [0, 1, 2, 3, 4];

	for (const scrollTop of scrollTopPositions) {
		const output = renderToString(
			<Box
				height={4}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<Box sticky>
					<Text>H1</Text>
				</Box>
				<Text>Item 1</Text>
				<Text>Item 2</Text>
				<Box sticky>
					<Text>H2</Text>
				</Box>
				<Text>Item 3</Text>
				<Text>Item 4</Text>
			</Box>,
		);

		t.snapshot(output, `scrollTop: ${scrollTop}`);
	}
});

test('stickyChildren', t => {
	const output = renderToString(
		<Box height={4} overflowY="scroll" flexDirection="column" scrollTop={2}>
			<Box sticky stickyChildren={<Text>Stuck</Text>}>
				<Text>Original</Text>
			</Box>
			<Text>Item 1</Text>
			<Text>Item 2</Text>
			<Text>Item 3</Text>
		</Box>,
	);

	t.snapshot(output);
});

test('opaque sticky header clears background', t => {
	const output = renderToString(
		<Box height={3} overflowY="scroll" flexDirection="column" scrollTop={1}>
			<Box sticky opaque width={4}>
				<Text>H</Text>
			</Box>
			<Text>----</Text>
			<Text>Content</Text>
		</Box>,
	);

	t.snapshot(output);
});

test('nested sticky headers', t => {
	const output = renderToString(
		<Box
			height={10}
			overflowY="scroll"
			flexDirection="column"
			scrollTop={3}
			borderStyle="single"
		>
			<Text>Outer 1</Text>
			<Text>Outer 2</Text>
			<Box
				height={5}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={2}
				borderStyle="single"
			>
				<Box sticky>
					<Text>Inner Header</Text>
				</Box>
				<Text>Inner 1</Text>
				<Text>Inner 2</Text>
				<Text>Inner 3</Text>
				<Text>Inner 4</Text>
			</Box>
			<Text>Outer 3</Text>
			<Text>Outer 4</Text>
		</Box>,
	);

	t.snapshot(output);
});
