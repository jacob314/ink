import React from 'react';
import {render, Box, Text, useApp} from './src/index.js';

function App() {
	const {exit} = useApp();

	return (
		<Box flexDirection="column" height={10}>
			<Box
				flexDirection="column"
				overflowY="scroll"
				height={15}
				borderStyle="single"
			>
				<Box flexDirection="column" flexShrink={0}>
					{Array.from({length: 20}).map((_, i) => (
						<Text key={i}>Line {i}</Text>
					))}
					<Box
						opaque
						sticky="bottom"
						width="100%"
						borderStyle="single"
						borderColor="red"
					>
						<Text color="red">STICKY FOOTER</Text>
					</Box>
				</Box>
			</Box>
			<Text>Press Ctrl+C to exit</Text>
		</Box>
	);
}

render(<App />, {
	terminalBuffer: true,
});
