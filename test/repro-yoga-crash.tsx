import EventEmitter from 'node:events';
import test from 'ava';
import React, {useState, useEffect} from 'react';
import {render, Box, Text, StaticRender} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('does not crash when scrollable container rerenders with cached StaticRender child', async t => {
	const stdout = createStdout();
	const stdin = new EventEmitter() as any;
	stdin.isTTY = true;
	stdin.setRawMode = () => {};
	stdin.ref = () => {};
	stdin.unref = () => {};
	stdin.read = () => null;

	const App = () => {
		const [counter, setCounter] = useState(0);

		useEffect(() => {
			const timer = setInterval(() => {
				setCounter(prev => prev + 1);
			}, 10);
			return () => clearInterval(timer);
		}, []);

		return (
			<Box height={10} flexDirection="column" overflow="scroll">
				<StaticRender width={80}>
					<Box height={20} flexDirection="column">
						<Box sticky="top">
							<Text>Sticky Header</Text>
						</Box>
						<Text>Item 1</Text>
						<Text>Item 2</Text>
					</Box>
				</StaticRender>
				<Text>Counter: {counter}</Text>
			</Box>
		);
	};

	const {unmount} = render(<App />, {stdout, stdin, debug: true});

	// Wait for a few rerenders to ensure cache is hit and children are unmounted
	await new Promise(resolve => setTimeout(resolve, 100));

	unmount();
	t.pass();
});
