/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React from 'react';
import {
	render,
	Box,
	Text,
	useApp,
	useInput,
	useStdout,
} from '../../src/index.js';

function RerenderExample() {
	const {exit, rerender} = useApp();
	const {stdout} = useStdout();

	useInput(input => {
		if (input === 'q') {
			exit();
		}

		if (input === 'x') {
			// Intentionally mess up output
			for (let i = 0; i < 20; i++) {
				process.stderr.write(`test output that messes up the screen ${i}\n`);
			}

			// Show cursor
			process.stdout.write('\u001B[?25h');
		}

		if (input === 'r') {
			rerender();
		}
	});

	return (
		<Box
			borderStyle="single"
			width={stdout.columns}
			height={stdout.rows}
			justifyContent="center"
			alignItems="center"
			flexDirection="column"
		>
			<Text>Press 'x' to mess up output (write to stderr + show cursor)</Text>
			<Text>Press 'r' to rerender (fix output)</Text>
			<Text>Press 'q' to exit</Text>
		</Box>
	);
}

render(<RerenderExample />, {
	alternateBuffer: true,
	incrementalRendering: true,
});
