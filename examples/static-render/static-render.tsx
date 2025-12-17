import process from 'node:process';
import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, StaticRender} from '../../src/index.js';

function HeavyComponent() {
	// Create a large grid of boxes to simulate heavy layout
	const size = 50;
	const grid = Array.from({length: size * size}).map((_, i) => (
		// eslint-disable-next-line react/no-array-index-key
		<Box key={`box-${i}`} width={7} height={3} borderStyle="single">
			<Text>Y{i}</Text>
		</Box>
	));

	return (
		<Box width={size * 3} flexWrap="wrap">
			{grid}
		</Box>
	);
}

export default function Example() {
	const [counter, setCounter] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter(c => c + 1);
		}, 16);

		return () => {
			clearInterval(timer);
		};
	}, []);

	const heavyContent = useMemo(() => <HeavyComponent />, []);

	return (
		<Box flexDirection="column">
			<StaticRender width={process.stdout.columns || 80}>
				{heavyContent}
			</StaticRender>
			<Text color="green">Counter: {counter}</Text>
		</Box>
	);
}
