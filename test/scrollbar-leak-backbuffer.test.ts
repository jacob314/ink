import test from 'ava';
import {StyledChar} from '../src/tokenize.js';
import xtermHeadless, {type Terminal as XtermTerminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal} = xtermHeadless;
const serializer = new Serializer();

const createStyledChar = (char: string): StyledChar => new StyledChar(char, 0);

const createStyledLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));

const writeToTerm = async (term: XtermTerminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('scrollbar characters are NOT leaked to backbuffer during local scroll optimization', async t => {
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
	const term = new Terminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const totalLines = 20;
	const allLines = Array.from({length: totalLines}).map((_, i) =>
		createStyledLine(`Line ${i}`.padEnd(columns - 1, ' ')),
	);
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
				scrollHeight: totalLines,
				isScrollable: true,
				isVerticallyScrollable: true,
				scrollbarVisible: true,
				overflowToBackbuffer: true,
				lines: {
					updates: [{start: 0, end: totalLines, data: allLinesSerialized}],
					totalLength: totalLines,
				},
			},
		]);
		output = '';
		await worker.render();
		await writeToTerm(term, output);
	};

	// 1. Initial render (scrollTop 0)
	await updateScroll(0);
	t.is(term.buffer.active.baseY, 0);

	// 2. Scroll down 1 line.
	// This should trigger the local scroll optimization for backbuffer push.
	await updateScroll(1);
	t.is(term.buffer.active.baseY, 1, 'Should have 1 line in scrollback');

	// 3. Inspect the line in scrollback (the one that was at Row 0)
	const scrollbarChars = ['█', '▀', '▄'];
	const historyLine =
		term.buffer.active.getLine(0)?.translateToString(true) ?? '';

	for (const char of scrollbarChars) {
		if (historyLine.includes(char)) {
			t.fail(
				`Backbuffer line contains scrollbar character "${char}": "${historyLine}"`,
			);
		}
	}

	t.pass();
});
