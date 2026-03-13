import {PassThrough} from 'node:stream';
import test from 'ava';
import React from 'react';
import xtermHeadless from '@xterm/headless';
import delay from 'delay';
import {render, Box, Text} from '../src/index.js';

const {Terminal: XtermTerminal} = xtermHeadless;

test('sticky header should not overlap with bottom border when pushed out', async t => {
	const rows = 5;
	const columns = 20;
	const term = new XtermTerminal({cols: columns, rows, allowProposedApi: true});
	const stdout = {
		columns, rows,
		write(chunk: string) { term.write(chunk); return true; },
		on() {}, off() {}, removeListener() {}, end() {}, isTTY: true,
	} as unknown as NodeJS.WriteStream;

	// Create a scrollable box where the content is just a bit larger than the box.
	// We'll scroll it until only the bottom border is visible.
	const {unmount, rerender} = render(
		<Box flexDirection="column" height={rows} width={columns}>
			<Box 
				overflowY="scroll"
				height={1} // Viewport is 1 line high
				width={columns}
				overflowToBackbuffer
				scrollTop={0}
				scrollbar={false}
			>
				<Box flexDirection="column" borderStyle="round" width={columns}>
					<Box sticky width="100%">
						<Text backgroundColor="yellow">STICKY</Text>
					</Box>
					<Box height={2}>
						<Text>CONTENT</Text>
					</Box>
				</Box>
			</Box>
		</Box>,
		{
			stdout,
			stdin: new PassThrough() as any,
			patchConsole: false,
			terminalBuffer: true,
			renderProcess: false,
			stickyHeadersInBackbuffer: true,
		}
	);

	const getLine = (row: number) => term.buffer.active.getLine(term.buffer.active.baseY + row)?.translateToString(true) ?? '';

	await delay(200);

	// Inner box height: 1 (top border) + 1 (sticky) + 2 (content) + 1 (bottom border) = 5.
	// Scrollable container height: 1.
	// maxScrollTop = 5 - 1 = 4.
	// If scrollTop = 4, then terminal row 0 should show content row 4 (bottom border).
	
	rerender(
		<Box flexDirection="column" height={rows} width={columns}>
			<Box 
				overflowY="scroll"
				height={1} 
				width={columns}
				overflowToBackbuffer
				scrollTop={4}
				scrollbar={false}
			>
				<Box flexDirection="column" borderStyle="round" width={columns}>
					<Box sticky width="100%">
						<Text backgroundColor="yellow">STICKY</Text>
					</Box>
					<Box height={2}>
						<Text>CONTENT</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);

	await delay(200);

	const firstLine = getLine(0);
	t.log('Terminal row 0: "' + firstLine + '"');

	// Expect ONLY bottom border characters. Round border bottom is ╰──────────╯
	// It should NOT contain "STICKY".
	t.true(firstLine.includes('╰'), 'Should see bottom border');
	t.false(firstLine.includes('STICKY'), 'Should NOT see sticky header text on top of bottom border');

	unmount();
});
