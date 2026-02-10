import test from 'ava';
import React from 'react';
import stripAnsi from 'strip-ansi';
import delay from 'delay';
import {render, Box, Text, StaticRender} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

const MixedContent = ({useStatic}: {useStatic: boolean}) => {
	const content = (
		<Box flexDirection="column">
			<Box height={5} overflowY="scroll" borderStyle="single" borderColor="blue">
				<Text>Scrollable 1 Line 1</Text>
				<Text>Scrollable 1 Line 2</Text>
				<Text>Scrollable 1 Line 3</Text>
				<Text>Scrollable 1 Line 4</Text>
				<Text>Scrollable 1 Line 5</Text>
				<Text>Scrollable 1 Line 6</Text>
			</Box>
			<Box paddingLeft={2}>
				<Text color="yellow">Non-scrollable child 1</Text>
			</Box>
			<Box height={4} overflowY="scroll" borderStyle="round" borderColor="green">
				<Text>Scrollable 2 Line 1</Text>
				<Text>Scrollable 2 Line 2</Text>
				<Text>Scrollable 2 Line 3</Text>
				<Text>Scrollable 2 Line 4</Text>
				<Text>Scrollable 2 Line 5</Text>
			</Box>
			<Text>Non-scrollable child 2</Text>
		</Box>
	);

	if (useStatic) {
		return <StaticRender width={80}>{content}</StaticRender>;
	}
	return content;
};

test('StaticRender output matches normal output for mixed children (simple stdout)', async t => {
	const columns = 80;
	// 1. Render without static
	const stdoutNormal = createStdout(columns);
	const {unmount: unmountNormal} = render(<MixedContent useStatic={false} />, {
		stdout: stdoutNormal,
		patchConsole: false,
	});
	await delay(500);
	const outputNormal = stripAnsi(stdoutNormal.get()).trim();
	unmountNormal();

	// 2. Render with static
	const stdoutStatic = createStdout(columns);
	const {unmount: unmountStatic} = render(<MixedContent useStatic={true} />, {
		stdout: stdoutStatic,
		patchConsole: false,
	});
	await delay(500);
	const outputStatic = stripAnsi(stdoutStatic.get()).trim();
	unmountStatic();

	t.log('Normal Output:
' + outputNormal);
	t.log('Static Output:
' + outputStatic);

	t.is(outputStatic, outputNormal, 'Static output should match normal output');
});
