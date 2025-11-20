/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {render, Box, Text} from '../../src/index.js';

/**
 * Example demonstrating Thai language support with sara am (ำ)
 * Sara am is a special Thai vowel (U+0E33) that appears above the baseline
 */

function ThaiSaraAmExample() {
	return (
		<Box flexDirection="column" padding={1} gap={1}>
			<Text bold color="cyan">
				Thai Sara Am (ำ) Display Test
			</Text>

			<Box flexDirection="column">
				<Text dimColor>Common Thai words with sara am:</Text>
				<Text> • น้ำ (water)</Text>
				<Text> • นำ (to lead)</Text>
				<Text> • คำ (word)</Text>
				<Text> • น้ำตาล (sugar)</Text>
				<Text> • กำลัง (power/strength)</Text>
				<Text> • ทำงาน (to work)</Text>
			</Box>

			<Box flexDirection="column">
				<Text dimColor>Sara am in bordered boxes:</Text>
				<Box borderStyle="round" paddingX={2}>
					<Text>น้ำ</Text>
				</Box>
				<Box borderStyle="single" paddingX={2}>
					<Text>กำลังทำงาน</Text>
				</Box>
				<Box borderStyle="double" paddingX={2}>
					<Text>น้ำตาลทราย</Text>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Text dimColor>Sara am with text wrapping (width: 15):</Text>
				<Box borderStyle="round" width={15}>
					<Text>กำลังทำงานกับน้ำตาล</Text>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Text dimColor>Sara am with colors:</Text>
				<Text>
					<Text color="red">น้ำ</Text>
					<Text color="green">ตาล</Text>
					<Text> และ </Text>
					<Text color="blue">กำลัง</Text>
					<Text color="yellow">ทำงาน</Text>
				</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>
					✅ All Thai sara am characters are displayed correctly
				</Text>
			</Box>
		</Box>
	);
}

render(<ThaiSaraAmExample />);
