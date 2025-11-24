import React, {useState, useEffect, useRef} from 'react';
import {render, Box, Text} from '../../src/index.js';

function App() {
	const [count, setCount] = useState(0);
	const reference = useRef<any>(null);

	useEffect(() => {
		const tb = reference.current?.parentNode?.internalTerminalBuffer;
		if (tb) {
			tb.startRecording('sequence');
			setTimeout(() => {
				tb.stopRecording('test-replay.json');
				process.exit(0);
			}, 1000);
		}

		const i = setInterval(() => {
			setCount(c => c + 1);
		}, 100);
		return () => {
			clearInterval(i);
		};
	}, []);

	return (
		<Box
			ref={reference}
			overflowToBackbuffer
			width={30}
			height={10}
			borderStyle="round"
			overflowY="scroll"
		>
			<Box flexDirection="column">
				{Array.from({length: 20}).map((_, i) => (
					<Text key={i}>
						Line {i} {count}
					</Text>
				))}
			</Box>
		</Box>
	);
}

render(<App />, {terminalBuffer: true, animatedScroll: true});
