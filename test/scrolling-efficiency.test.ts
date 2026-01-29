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

test('scrolling is efficient (only new lines are updated)', async t => {
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

	const totalLines = 50;
	const allLines = Array.from({length: totalLines}).map((_, i) => createStyledLine(`Line ${i}`));
	const allLinesSerialized = serializer.serialize(allLines);

	const updateScroll = async (scrollTop: number) => {
		worker.update({id: 'root', children: [{id: 'scroll-box', children: []}]}, [
			{
				id: 'root',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
			},
			{
				id: 'scroll-box',
				x: 0,
				y: 0,
				width: columns,
				height: rows,
				scrollTop,
				isScrollable: true,
				overflowToBackbuffer: true,
				lines: {
					updates: [{start: 0, end: totalLines, data: allLinesSerialized}],
					totalLength: totalLines,
				},
			},
		]);
		output = '';
		worker.resetLinesUpdated();
		await worker.render();
		await writeToTerm(term, output);
        return worker.getLinesUpdated();
	};

	// 1. Initial render
	const initialUpdates = await updateScroll(0);
	t.is(initialUpdates, rows, 'Initial render should update all rows');

	// 2. Scroll down 2 lines
	const downUpdates = await updateScroll(2);
    // Ideally it should be 2, but let's see what it is currently.
    // Sequential write for 2 lines + sync for the rest if they changed?
    // In our case the lines 2-9 were already there.
	t.is(downUpdates, 2, 'Scrolling down 2 lines should only update 2 lines');

	// 3. Scroll up 2 lines
	const upUpdates = await updateScroll(0);
    // This is where the reported issue is: it might be 10 (all rows) instead of 2.
	t.is(upUpdates, 2, 'Scrolling up 2 lines should only update 2 lines');
});
