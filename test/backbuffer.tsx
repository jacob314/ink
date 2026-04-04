import React from 'react';
import test from 'ava';
import {type StyledLine} from '../src/styled-line.js';
import {type Region} from '../src/output.js';
import {render} from '../src/index.js';
import instances from '../src/instances.js';
import Box from '../src/components/Box.js';

import {toStyledCharacters} from '../src/measure-text.js';

// Mock stdout
class WriteStream {
	columns = 100;
	rows = 100;
	write() {}
	on() {}
	off() {}
}

const createLine = (text: string): StyledLine => toStyledCharacters(text);

test('captures clipped cachedRender content into backbuffer', t => {
	const stdout = new WriteStream() as unknown as NodeJS.WriteStream;

	const cachedOutput: StyledLine[] = [
		createLine('Line 1 (cached)'),
		createLine('Line 2 (cached)'),
		createLine('Line 3 (cached)'),
		createLine('Line 4 (cached)'),
		createLine('Line 5 (cached)'),
		createLine('Line 6 (cached)'),
	];

	const cachedRender: Region = {
		id: 'cached',
		x: 0,
		y: 0,
		width: 20,
		height: 6,
		lines: cachedOutput,
		styledOutput: cachedOutput,
		isScrollable: false,
		maxWrittenY: 5,
		stickyHeaders: [],
		children: [],
		selectableSpans: [],
	};

	// We need to bypass type checking to pass cachedRender to ink-static-render
	function CachedBox(props: any) {
		return React.createElement('ink-static-render', props);
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
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const {terminalBuffer} = inkInstance as any;
	t.truthy(terminalBuffer, 'TerminalBuffer should exist');

	// Inspect lines in terminalBuffer
	// terminalBuffer.lines is private, cast to any

	const lines = terminalBuffer.lines as StyledLine[];

	// We expect lines 1 and 2 to be in the backbuffer because they are shifted up by 2.
	const line0 = lines[0]?.getText().trim();
	const line1 = lines[1]?.getText().trim();

	t.is(line0, 'Line 3 (cached)');
	t.is(line1, 'Line 4 (cached)');

	unmount();
});
