/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
	render,
	Box,
	Text,
	useInput,
	useApp,
	useStdout,
} from '../../src/index.js';

function FullWidthBackground() {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const [terminalWidth, setTerminalWidth] = React.useState(stdout.columns);

	React.useEffect(() => {
		const onResize = () => {
			setTerminalWidth(stdout.columns);
		};

		stdout.on('resize', onResize);

		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	const backgroundColor = 'blue';
	const borderColor = 'white';

	useInput(input => {
		if (input === 'q') {
			exit();
		}
	});

	return (
		<Box
			width="100%"
			height="100%"
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
		>
			<Text color="red">{'X'.repeat(terminalWidth)}</Text>
			<Box
				borderStyle={backgroundColor ? undefined : 'round'}
				borderTop={false}
				borderBottom={false}
				borderLeft={Boolean(!backgroundColor)}
				borderRight={Boolean(!backgroundColor)}
				borderColor={borderColor}
				paddingX={backgroundColor ? 0 : 1}
				width={terminalWidth}
				flexDirection="row"
				alignItems="stretch"
				minHeight={1}
				flexShrink={0}
				backgroundColor={backgroundColor}
			>
				<Box
					flexGrow={1}
					padding={1}
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
				>
					<Text bold color="white">
						Centered Text in a Full-Width Box
					</Text>
					<Box marginTop={1}>
						<Text dimColor color="white">
							Press 'q' to exit
						</Text>
					</Box>
				</Box>
			</Box>
			<Text color="red">{'X'.repeat(terminalWidth)}</Text>
		</Box>
	);
}

render(<FullWidthBackground />, {
	alternateBuffer: true,
	incrementalRendering: true,
});
