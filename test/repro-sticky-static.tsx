import test from 'ava';
import React from 'react';
import {render, Box, Text, StaticRender} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('sticky inside static render boundary test 4', t => {
	try {
		const out = renderToString(
			<Box
				height={10}
				width={50}
				overflowY="scroll"
				scrollTop={4}
				flexDirection="column"
				borderStyle="single"
			>
				<StaticRender width={48}>
					<Box flexDirection="column" flexShrink={0}>
						<Box key="sticky1" opaque sticky="top" height={1}>
							<Text>STICKY HEADER 1</Text>
						</Box>
						{Array.from({length: 5}).map((_, i) => {
							const key = `LineA-${i}`;
							return <Text key={key}>Line A{i}</Text>;
						})}
						<Box key="sticky2" opaque sticky="top" height={1}>
							<Text>STICKY HEADER 2</Text>
						</Box>
						{Array.from({length: 20}).map((_, i) => {
							const key = `LineB-${i}`;
							return <Text key={key}>Line B{i}</Text>;
						})}
					</Box>
				</StaticRender>
			</Box>,
		);

		const lines = out.split('\n');
		const header1Row = lines.findIndex(line =>
			line.includes('STICKY HEADER 1'),
		);
		const header2Row = lines.findIndex(line =>
			line.includes('STICKY HEADER 2'),
		);

		t.is(
			header1Row,
			1,
			`Expected STICKY HEADER 1 to be at row 1, but found at row ${header1Row}. Output: \n${out}`,
		);
		t.is(
			header2Row,
			3,
			`Expected STICKY HEADER 2 to be at row 3, but found at row ${header2Row}. Output: \n${out}`,
		);
	} catch (error: any) {
		console.error('CAUGHT ERR:', error);
		t.fail(`CAUGHT ERR: ${String(error.message || 'Unknown error')}`);
	}
});
