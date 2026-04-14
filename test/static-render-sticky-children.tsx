import path from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import test from 'ava';
import {Box, Text, StaticRender} from '../src/index.js';
import {render} from './helpers/render.js';
import {verifySvgSnapshot} from './helpers/svg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('StaticRender with stickyChildren (different height)', async t => {
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

	await Promise.all(
		scenarios.map(async ({name, scrollTop}) => {
			const {unmount, waitUntilReady, generateSvg} = await render(
				<Box
					height={10}
					width={30}
					overflowY="scroll"
					flexDirection="column"
					scrollTop={scrollTop}
				>
					<StaticRender width={30}>
						{() => (
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
										<Text>NATURAL HEADER</Text>
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
				30,
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
				'static-render-sticky-children',
				`${name}.svg`,
			);

			verifySvgSnapshot(t, svg, snapshotPath);
			await unmount();
		}),
	);
});
