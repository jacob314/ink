import test from 'ava';
import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

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

function validateConsistency(
	t: any,
	worker: TerminalBufferWorker,
	term: Terminal,
) {
	const writer = (worker as any).terminalWriter;
	const {rows} = worker as any;

	// 1. Validate Backbuffer
	const backbufferLength = writer.backbuffer.length;
	t.is(
		term.buffer.active.baseY,
		backbufferLength,
		'Terminal history length should match backbuffer length',
	);

	for (let i = 0; i < backbufferLength; i++) {
		const expected = writer.backbuffer[i].text;
		const actual =
			term.buffer.active.getLine(i)?.translateToString(true).trim() || '';
		t.is(actual, expected, `Backbuffer line ${i} mismatch`);
	}

	// 2. Validate Screen
	for (let i = 0; i < rows; i++) {
		const expected = writer.screen[i]?.text || '';
		const actual =
			term.buffer.active
				.getLine(term.buffer.active.baseY + i)
				?.translateToString(true)
				.trim() || '';
		t.is(actual, expected, `Screen line ${i} mismatch`);
	}
}

test('TerminalBufferWorker matches xterm state exactly after oscillation with StaticRender-like structure', async t => {
	const columns = 100;
	const rows = 20;
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
		animatedScroll: false,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const totalLines = 100;
	const allLines = Array.from({length: totalLines}).map((_, i) => {
		if (i === 0) return createStyledLine('START OF STATIC BLOCK');
		return createStyledLine(`Line ${i}`);
	});
	const allLinesSerialized = serializer.serialize(allLines);

	const tree = {id: 'root', children: [{id: 'scroll-box', children: []}]};

	const updateScroll = async (scrollTop: number) => {
		worker.update(tree, [
			{
				id: 'root',
				x: 0,
				y: 0,
				width: columns,
				height: rows, // Screen size
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
		validateConsistency(t, worker, term);
	};

	// 1. Initial render
	await updateScroll(0);

	// 2. Down 4 times
	for (let i = 1; i <= 4; i++) {
		await updateScroll(i);
	}

	// 3. Up 4 times
	for (let i = 3; i >= 0; i--) {
		await updateScroll(i);
	}

	// 4. Down 4 more times
	for (let i = 1; i <= 4; i++) {
		await updateScroll(i);
	}

	// 5. Up 4 more times
	for (let i = 3; i >= 0; i--) {
		await updateScroll(i);
	}

	t.pass();
});
