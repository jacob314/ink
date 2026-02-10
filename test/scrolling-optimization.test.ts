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

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('scrolling oscillation (down-up-down) uses optimized scrolling', async t => {
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
		debugRainbowEnabled: true,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const totalLines = 50;
	const allLines = Array.from({length: totalLines}).map((_, i) =>
		createStyledLine(`Line ${i}`),
	);
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

	// 1. Initial render (scrollTop: 0)
	const initialUpdates = await renderFrame(0);
	t.is(initialUpdates, rows, 'Initial render should update all rows');

	// 2. Scroll down 2 lines (scrollTop: 2)
	// This pushes Line 0 and Line 1 to history.
	const downUpdates = await renderFrame(2);
	t.is(downUpdates, 2, 'Scrolling down 2 lines should only update 2 lines');

	// 3. Scroll up 2 lines (scrollTop: 0)
	// This brings back Line 0 and Line 1 from history (visually).
	const upUpdates = await renderFrame(0);
	t.log(`Up updates: ${upUpdates}`);
	// Up updates should be 2 + any overhead (border etc).
	// In this simple case it's 4.
	t.is(
		upUpdates,
		4,
		'Scrolling up 2 lines should only update 4 lines (2 content + 2 border?)',
	);

	// 4. Scroll down 2 lines again (scrollTop: 2)
	// These lines are ALREADY in history.
	// We should still use optimized scroll (move lines up on screen)
	// but without pushing to history again.
	const downAgainUpdates = await renderFrame(2);
	t.log(`Down again updates: ${downAgainUpdates}`);

	// If it's re-rendering everything, downAgainUpdates will be 'rows' (10).
	// If it's optimized, it should be small (around 4).
	t.true(
		downAgainUpdates < rows,
		'Scrolling down again (into existing history) should be optimized',
	);
});
