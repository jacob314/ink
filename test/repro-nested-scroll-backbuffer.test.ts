import test from 'ava';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {type StyledChar} from '@alcalzone/ansi-tokenize';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal: XtermTerminal} = xtermHeadless;

const serializer = new Serializer();

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createStyledLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('TerminalBufferWorker should correctly render nested scrollables in root backbuffer by expanding them', async t => {
	const columns = 80;
	const rows = 5;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows,
		columns,
	} as unknown as NodeJS.WriteStream;

	const worker = new TerminalBufferWorker(columns, rows, {
		stdout,
		stickyHeadersInBackbuffer: true
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// root (height 10, viewport 5) -> 5 rows of history
	//   inner (y=0 in root, height 2, scrollHeight 5, scrollTop 3, overflowToBackbuffer=true)
	
	// With the fix, when composing root history (rows 0-4):
	// Inner should be expanded to its scrollHeight (5).
	// So root history rows 0-4 should show Inner lines 0-4.

	const innerLines = Array.from({length: 5}, (_, i) => createStyledLine(`Inner ${i + 1}`));
	const innerData = serializer.serialize(innerLines);

	worker.update(
		{ id: 'root', children: [{id: 'inner', children: []}] },
		[
			{
				id: 'root',
				x: 0, y: 0, width: columns, height: 10,
				lines: { updates: [], totalLength: 10 }
			},
			{
				id: 'inner',
				x: 0, y: 0, width: columns, height: 2,
				isScrollable: true,
				scrollTop: 3,
				scrollHeight: 5,
				overflowToBackbuffer: true,
				lines: { updates: [{start: 0, end: 5, data: innerData}], totalLength: 5 }
			}
		]
	);

	await worker.render();
	output = '';
	
	await worker.fullRender();
	await writeToTerm(term, output);

	// Total length = 5 (root history) + 3 (inner history) + 5 (viewport) = 13.
	t.is(term.buffer.active.length, 13, 'Total buffer length should be 13');
	
	// Root history rows 0-4 should contain Inner lines 0-4 (because Inner was expanded)
	t.is(term.buffer.active.getLine(0)?.translateToString(true).trim(), 'Inner 1');
	t.is(term.buffer.active.getLine(1)?.translateToString(true).trim(), 'Inner 2');
	t.is(term.buffer.active.getLine(2)?.translateToString(true).trim(), 'Inner 3');
	t.is(term.buffer.active.getLine(3)?.translateToString(true).trim(), 'Inner 4');
	t.is(term.buffer.active.getLine(4)?.translateToString(true).trim(), 'Inner 5');
});

test('TerminalBufferWorker should correctly render inner overflow of nested scrollable in its own chunk', async t => {
	const columns = 80;
	const rows = 5; // Use smaller terminal to ensure scrolling
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows,
		columns,
	} as unknown as NodeJS.WriteStream;

	const worker = new TerminalBufferWorker(columns, rows, {
		stdout,
		stickyHeadersInBackbuffer: true
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// root (h=5)
	//   inner (y=0, h=5, scrollTop=15, scrollHeight=20, overflowToBackbuffer=true)
	
	// Inner has 15 lines of backbuffer.
	// We want to see Inner lines 0-14 in the history.

	const innerLines = Array.from({length: 20}, (_, i) => createStyledLine(`Inner ${i + 1}`));
	const innerData = serializer.serialize(innerLines);

	worker.update(
		{ id: 'root', children: [{id: 'inner', children: []}] },
		[
			{ id: 'root', x: 0, y: 0, width: columns, height: 5 },
			{
				id: 'inner',
				x: 0, y: 0, width: columns, height: 5,
				isScrollable: true,
				scrollTop: 15,
				scrollHeight: 20,
				overflowToBackbuffer: true,
				lines: { updates: [{start: 0, end: 20, data: innerData}], totalLength: 20 }
			}
		]
	);

	await worker.render();
	output = '';
	
	await worker.fullRender();
	await writeToTerm(term, output);

	// Total length = 15 (inner history) + 5 (viewport) = 20.
	t.is(term.buffer.active.length, 20, 'Total buffer length should be 20');

	// Inner history row 0 should be "Inner 1".
	t.is(term.buffer.active.getLine(0)?.translateToString(true).trim(), 'Inner 1');
	// Inner history row 14 should be "Inner 15".
	t.is(term.buffer.active.getLine(14)?.translateToString(true).trim(), 'Inner 15');
});
