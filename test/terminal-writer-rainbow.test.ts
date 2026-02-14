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

// Helper to count lines that have a specific background color in xterm.js
function countLinesWithBackgroundColor(term: Terminal, colorIndex: number): number {
    let count = 0;
    console.log(`Searching for colorIndex: ${colorIndex}`);
    for (let i = 0; i < term.rows; i++) {
        const line = term.buffer.active.getLine(term.buffer.active.baseY + i);
        if (!line) continue;
        
        const cell = line.getCell(0);
        const bg = cell?.getBgColor();
        console.log(`  Line ${i}, bg: ${bg}`);
        if (cell && bg === colorIndex) {
            count++;
        }
    }
    return count;
}

// Map color names to ANSI color indices (standard 16 colors)
const colorToAnsi: Record<string, number> = {
    'red': 1,
    'green': 2,
    'yellow': 3,
    'blue': 4,
    'magenta': 5,
    'cyan': 6,
    'white': 7,
};

test('rainbow debug counts actual terminal updates', async t => {
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

	const worker = new TerminalBufferWorker(columns, rows, {
        stdout,
        debugRainbowEnabled: true
    });
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const totalLines = 50;
	const allLines = Array.from({length: totalLines}).map((_, i) => createStyledLine(`Line ${i}`));
	const allLinesSerialized = serializer.serialize(allLines);

	const renderFrame = async (scrollTop: number) => {
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
	const initialUpdates = await renderFrame(0);
	t.is(initialUpdates, rows, 'Initial render should update all rows');

	// 2. Scroll down 2 lines
	const downUpdates = await renderFrame(2);
	t.is(downUpdates, 2, 'Scrolling down 2 lines should only update 2 lines');

	// 3. Scroll up 2 lines
	const upUpdates = await renderFrame(0);
	t.is(upUpdates, 2, 'Scrolling up 2 lines should only update 2 lines');
});
