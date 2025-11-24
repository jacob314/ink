import React from 'react';
import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {render} from '../src/index.js';
import instances from '../src/instances.js';
import Box from '../src/components/Box.js';

// Mock stdout
class WriteStream {
	columns = 100;
	rows = 100;
	write() {}
	on() {}
	off() {}
}

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));

test('captures clipped cachedRender content into backbuffer', t => {
	const stdout = new WriteStream() as unknown as NodeJS.WriteStream;

	const cachedOutput: StyledChar[][] = [
		createLine('Line 1 (cached)'),
		createLine('Line 2 (cached)'),
		createLine('Line 3 (cached)'),
		createLine('Line 4 (cached)'),
		createLine('Line 5 (cached)'),
		createLine('Line 6 (cached)'),
	];

	const cachedRender = {
		output: cachedOutput,
		width: 20,
		height: 6,
	};

	// We need to bypass type checking to pass cachedRender to ink-box
	function CachedBox(props: any) {
		return React.createElement('ink-box', props);
	}

	const {unmount} = render(
		<Box height={3} overflowY="scroll" flexDirection="column">
			<CachedBox
				cachedRender={cachedRender}
				style={{
					marginTop: -2, // Shift up by 2 lines
					width: 20,
					height: 6,
				}}
			/>
		</Box>,
		{
			stdout,
			renderProcess: true, // Enable terminalBuffer
			debug: false,
		},
	);

	const inkInstance = instances.get(stdout);
	t.truthy(inkInstance, 'Ink instance should exist');

	// Access private terminalBuffer
	const terminalBuffer = (inkInstance as any).terminalBuffer;
	t.truthy(terminalBuffer, 'TerminalBuffer should exist');

	// Inspect lines in terminalBuffer
	// terminalBuffer.lines is private, cast to any
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const lines = (terminalBuffer as any).lines as StyledChar[][];

	// We expect lines 1 and 2 to be in the backbuffer because they are shifted up by 2.
	const line0 = lines[0]?.map(c => c.value).join('');
	const line1 = lines[1]?.map(c => c.value).join('');

	t.is(line0, 'Line 1 (cached)');
	t.is(line1, 'Line 2 (cached)');

	unmount();
});
