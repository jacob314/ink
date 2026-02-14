import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

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

const writeToTerm = (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('multiple renders do not add extra blank lines at the bottom', async t => {
	const columns = 80;
	const rows = 10;
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

	const worker = new TerminalBufferWorker(columns, rows, {stdout});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const renderFrame = async (text: string) => {
		const lines = [createStyledLine(text)];
		const data = serializer.serialize(lines);

		worker.update({id: 'root', children: []}, [
			{
				id: 'root',
				y: 0,
				width: columns,
				height: 1,
				lines: {
					updates: [{start: 0, end: 1, data}],
					totalLength: 1,
				},
			},
		]);
		output = '';
		await worker.render();
		await writeToTerm(term, output);
	};

	// Perform 3 renders
	await renderFrame('Frame 1');
	console.log(`BaseY after Frame 1: ${term.buffer.active.baseY}, total lines: ${term.buffer.active.length}`);
	t.is(term.buffer.active.baseY, 0, 'BaseY should be 0 after Frame 1');
	
	await renderFrame('Frame 2');
	console.log(`BaseY after Frame 2: ${term.buffer.active.baseY}, total lines: ${term.buffer.active.length}`);
	t.is(term.buffer.active.baseY, 0, 'BaseY should be 0 after Frame 2');
	
	await renderFrame('Frame 3');
	console.log(`BaseY after Frame 3: ${term.buffer.active.baseY}, total lines: ${term.buffer.active.length}`);
	t.is(term.buffer.active.baseY, 0, 'BaseY should be 0 after Frame 3');

	// If there are extra newlines, baseY would increase.
});
