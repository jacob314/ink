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

test('large root scroll oscillation does not duplicate lines', async t => {
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
		animatedScroll: false,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const renderFrameWithHeight = async (height: number) => {
		worker.update({id: 'root', children: []}, [
			{
				id: 'root',
				x: 0,
				y: 0,
				width: columns,
				height,
				lines: {
					updates: [
						{
							start: 0,
							end: height,
							data: serializer.serialize(
								Array.from({length: height}).map((_, i) =>
									createStyledLine(`Line ${i}`),
								),
							),
						},
					],
					totalLength: height,
				},
				isScrollable: true,
				isVerticallyScrollable: true,
				scrollbarVisible: true,
			},
		]);
		output = '';
		await worker.render();
		await writeToTerm(term, output);
	};

	// 1. Initial render (height 10, cameraY 0)
	await renderFrameWithHeight(10);
	t.is(term.buffer.active.baseY, 0, 'Initially no scrollback');

	// 2. Grow to 40 (cameraY 30)
	// This should push 30 lines to history.
	await renderFrameWithHeight(40);
	t.log(`After grow to 40: baseY=${term.buffer.active.baseY}`);
	t.is(term.buffer.active.baseY, 30, 'Should have 30 lines in scrollback');

	const scrollbarChars = ['█', '▀', '▄'];
	for (let i = 0; i < term.buffer.active.baseY; i++) {
		const line = term.buffer.active.getLine(i)?.translateToString(true) || '';
		for (const char of scrollbarChars) {
			if (line.includes(char)) {
				t.fail(
					`Line ${i} in backbuffer contains scrollbar character "${char}": "${line}"`,
				);
			}
		}
	}

	// 3. Shrink back to 10 (cameraY 0)
	await renderFrameWithHeight(10);
	t.log(`After shrink to 10: baseY=${term.buffer.active.baseY}`);
	t.is(
		term.buffer.active.baseY,
		30,
		'Still 30 lines in scrollback after shrink',
	);

	// 4. Grow back to 40 (cameraY 30)
	await renderFrameWithHeight(40);
	t.log(`After regrow to 40: baseY=${term.buffer.active.baseY}`);

	t.is(
		term.buffer.active.baseY,
		30,
		'Should NOT have pushed duplicate lines to scrollback after oscillation',
	);
});
