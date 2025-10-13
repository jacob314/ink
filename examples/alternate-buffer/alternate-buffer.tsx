import React from 'react';
import {
	render,
	Box,
	Text,
	useApp,
	useInput,
	useStdout,
} from '../../src/index.js';

function AlternateBufferExample() {
	const {exit} = useApp();
	const {stdout} = useStdout();

	useInput(input => {
		if (input === ' ') {
			exit();
		}
	});

	return (
		<Box
			borderStyle="single"
			width={stdout.columns}
			height={stdout.rows}
			justifyContent="center"
			alignItems="center"
		>
			<Text>Press space to exit.</Text>
		</Box>
	);
}

render(<AlternateBufferExample />, {alternateBuffer: true});
