import React, {useState, useEffect} from 'react';
import {render, Box, Text, useApp} from '../../src/index.js';

function ExitCursorPosition() {
	const [count, setCount] = useState(0);
	const {exit} = useApp();

	useEffect(() => {
		if (count === 0) {
			setCount(1);
			return;
		}

		if (count === 1) {
			// Second render done, exit
			exit();
		}
	}, [count, exit]);

	return (
		<Box flexDirection="column">
			<Box key="row-0">
				<Text>Line 0: {count}</Text>
			</Box>
			<Box key="row-1">
				<Text>Line 1</Text>
			</Box>
			<Box key="row-2">
				<Text>Line 2</Text>
			</Box>
		</Box>
	);
}

const {waitUntilExit} = render(<ExitCursorPosition />, {
	incrementalRendering: true,
	terminalBuffer: true,
});
await waitUntilExit();
console.log('exited');
