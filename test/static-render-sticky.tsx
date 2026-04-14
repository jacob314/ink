import path from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import test from 'ava';
import {Box, Text, StaticRender} from '../src/index.js';
import {render} from './helpers/render.js';
import {verifySvgSnapshot} from './helpers/svg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('StaticRender with sticky header', async t => {
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

	for (const {name, scrollTop} of scenarios) {
		const {unmount, waitUntilReady, generateSvg} = await render(
			<Box
				height={5}
				width={20}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<StaticRender width={20}>
					{() => (
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
					)}
				</StaticRender>
			</Box>,
			20,
			{
				terminalHeight: 5,
				terminalBuffer: true,
				renderProcess: false,
			},
		);

		await waitUntilReady();
		const svg = generateSvg();
		const snapshotPath = path.join(
			__dirname,
			'snapshots',
			'static-render-sticky',
			`${name}.svg`,
		);

		verifySvgSnapshot(t, svg, snapshotPath);
		await unmount();
	}
});

test('StaticRender containing multiple sticky headers', async t => {
	const scenarios = [
		{
			name: 'H1_stuck',
			scrollTop: 1,
		},
		{
			name: 'H1_pushed_by_H2',
			scrollTop: 3,
		},
		{
			name: 'H2_stuck',
			scrollTop: 5,
		},
	];

	for (const {name, scrollTop} of scenarios) {
		const {unmount, waitUntilReady, generateSvg} = await render(
			<Box
				height={3}
				width={20}
				overflowY="scroll"
				flexDirection="column"
				scrollTop={scrollTop}
			>
				<StaticRender width={20}>
					{() => (
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
							<Text>End of list</Text>
						</Box>
					)}
				</StaticRender>
			</Box>,
			20,
			{
				terminalHeight: 3,
				terminalBuffer: true,
				renderProcess: false,
			},
		);

		await waitUntilReady();
		const svg = generateSvg();
		const snapshotPath = path.join(
			__dirname,
			'snapshots',
			'static-render-sticky-multiple',
			`${name}.svg`,
		);

		verifySvgSnapshot(t, svg, snapshotPath);
		await unmount();
	}
});

test('StaticRender with multi-line sticky header', async t => {
	const {unmount, waitUntilReady, generateSvg} = await render(
		<Box
			height={10}
			width={20}
			overflowY="scroll"
			flexDirection="column"
			scrollTop={5}
		>
			<StaticRender width={20}>
				{() => (
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
				)}
			</StaticRender>
		</Box>,
		20,
		{
			terminalHeight: 10,
			terminalBuffer: true,
			renderProcess: false,
		},
	);

	await waitUntilReady();
	const svg = generateSvg();
	const snapshotPath = path.join(
		__dirname,
		'snapshots',
		'static-render-sticky-multiline',
		'output.svg',
	);

	verifySvgSnapshot(t, svg, snapshotPath);
	await unmount();
});
