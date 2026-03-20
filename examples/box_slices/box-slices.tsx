/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {Box, Text, useApp, useInput} from '../../src/index.js';

export default function BoxSlices() {
	const {exit} = useApp();

	useInput((input, key) => {
		if (input === 'q' || key.escape) {
			exit();
		}
	});

	const booleans = [true, false];
	const permutations = [];

	for (const top of booleans) {
		for (const bottom of booleans) {
			for (const left of booleans) {
				for (const right of booleans) {
					permutations.push({top, bottom, left, right});
				}
			}
		}
	}

	return (
		<Box flexDirection="column" padding={1} rowGap={1}>
			<Text>Box Border Slices Permutations</Text>
			<Box flexDirection="row" flexWrap="wrap" rowGap={1} columnGap={1}>
				{permutations.map(perm => {
					const key = `top-${String(perm.top)}-bot-${String(perm.bottom)}-left-${String(perm.left)}-right-${String(perm.right)}`;
					return (
						<Box
							key={key}
							borderStyle="single"
							borderTop={perm.top}
							borderBottom={perm.bottom}
							borderLeft={perm.left}
							borderRight={perm.right}
							flexDirection="column"
							width={16}
						>
							<Text>Top: {perm.top ? 'T' : 'F'}</Text>
							<Text>Bot: {perm.bottom ? 'T' : 'F'}</Text>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
