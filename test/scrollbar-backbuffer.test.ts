import test from 'ava';
import {StyledLine} from '../src/styled-line.js';
import xtermHeadless, {type Terminal as XtermTerminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

const {Terminal} = xtermHeadless;
const serializer = new Serializer();

const createStyledLine = (text: string): StyledLine => {
	const line = new StyledLine();
	for (const char of text) {
		line.pushChar(char, 0);
	}

	return line;
};

const writeToTerm = async (term: XtermTerminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('scrollbar characters are not pushed to backbuffer', async t => {
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

	const totalLines = 50;
	const allLines = Array.from({length: totalLines}).map((_, i) =>
		createStyledLine(`Line ${i}`),
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

	// 1. Initial render
	await updateScroll(0);

	// 2. Scroll down 5 lines to push them to history
	await updateScroll(5);
	t.is(term.buffer.active.baseY, 5);

	// 3. Inspect history lines for scrollbar characters
	const scrollbarChars = ['█', '▀', '▄'];
	for (let i = 0; i < term.buffer.active.baseY; i++) {
		const line = term.buffer.active.getLine(i)?.translateToString(true) ?? '';
		for (const char of scrollbarChars) {
			if (line.includes(char)) {
				t.fail(
					`Line ${i} in backbuffer contains scrollbar character "${char}": "${line}"`,
				);
			}
		}
	}

	t.pass();
});
