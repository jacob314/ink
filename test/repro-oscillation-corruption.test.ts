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

test('Reproduction: 4-down/4-up oscillation leads to backbuffer corruption', async t => {
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
		animatedScroll: false,
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

	const tree = {id: 'root', children: [{id: 'scroll-box', children: []}]};

	const updateScroll = async (scrollTop: number, label: string) => {
		worker.update(tree, [
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

		// Log current state
		const {baseY} = term.buffer.active;
		const history = [];
		for (let i = 0; i < baseY; i++) {
			history.push(term.buffer.active.getLine(i)?.translateToString(true));
		}

		t.log(
			`${label} (scrollTop: ${scrollTop}) -> baseY: ${baseY}, history: [${history.join(', ')}]`,
		);

		// Verify no duplicates in history
		const seen = new Set();
		for (const line of history) {
			if (line && seen.has(line)) {
				t.fail(
					`${label}: Duplicate line in history: "${line}". History: [${history.join(', ')}]`,
				);
			}

			seen.add(line);
		}
	};

	// 1. Initial render
	await updateScroll(0, 'Initial');

	// 2. Down 4 times
	t.log('--- SCROLLING DOWN 4 ---');
	for (let i = 1; i <= 4; i++) {
		await updateScroll(i, `Down ${i}`);
	}

	// 3. Up 4 times
	t.log('--- SCROLLING UP 4 ---');
	for (let i = 3; i >= 0; i--) {
		await updateScroll(i, `Up ${i}`);
	}

	// 4. Down 4 more times
	t.log('--- SCROLLING DOWN 4 AGAIN ---');
	for (let i = 1; i <= 4; i++) {
		await updateScroll(i, `Down Again ${i}`);
	}

	// 5. Up 4 more times
	t.log('--- SCROLLING UP 4 AGAIN ---');
	for (let i = 3; i >= 0; i--) {
		await updateScroll(i, `Up Again ${i}`);
	}

	t.pass();
});
