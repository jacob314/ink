import test from 'ava';
import React, {useState, act} from 'react';
import {Box, Text, StaticRender} from '../src/index.js';
import {render as renderTerminal} from './helpers/render.js';
import {waitFor} from './helpers/wait-for.js';

test('overlapping transparent static render over scrolled content', async t => {
	let updateApp: React.Dispatch<React.SetStateAction<boolean>>;

	function App() {
		const [scrolled, setScrolled] = useState(false);
		updateApp = setScrolled;

		return (
			<Box flexDirection="column" width={20} height={5}>
				<Box
					overflowY="scroll"
					flexDirection="column"
					height={5}
					scrollTop={scrolled ? 1 : 0}
				>
					<StaticRender width={10} deps={[scrolled]}>
						{() => (
							<Box borderStyle="single">
								<Text>item</Text>
							</Box>
						)}
					</StaticRender>
					<Text>Background Text</Text>
				</Box>
			</Box>
		);
	}

	const instance = await renderTerminal(<App />, 20, {
		terminalHeight: 5,
		terminalBuffer: true,
		maxFps: 1000,
	});

	await instance.waitUntilReady();

	let output = instance.lastFrame();
	t.true(output.includes('item'));
	t.true(output.includes('Background Text'));

	// Scroll up
	act(() => {
		updateApp(true);
	});

	await waitFor(() => {
		const currentOutput = instance.lastFrame();
		return (
			currentOutput.includes('item') && currentOutput.includes('Background')
		);
	});

	output = instance.lastFrame();
	t.true(output.includes('item'));
	t.true(output.includes('Background Text'));

	await instance.unmount();
});
