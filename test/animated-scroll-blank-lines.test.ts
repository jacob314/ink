import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import * as fakeTimers from '@sinonjs/fake-timers';

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

test('TerminalBufferWorker prevents blank lines during animated scroll', async t => {
	const clock = fakeTimers.install();
	try {
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
			animatedScroll: true,
			animationInterval: 10,
		});
		const term = new XtermTerminal({
			cols: columns,
			rows,
			allowProposedApi: true,
			convertEol: true,
		});

		// Create a large content region
		const totalLines = 100;
		const lines = [];
		for (let i = 0; i < totalLines; i++) {
			lines.push(createStyledLine(`Line ${String(i + 1).padStart(3, '0')}`));
		}
		const data = serializer.serialize(lines);

		const tree = {
			id: 'root',
			children: [{id: 'content', children: []}],
		};

		// Initial state: scrolled to top
		worker.update(tree, [
			{
				id: 'root',
				y: 0,
				width: columns,
				height: rows,
			},
			{
				id: 'content',
				y: 0,
				width: columns,
				height: rows,
				isScrollable: true,
				isVerticallyScrollable: true,
				scrollHeight: totalLines,
				scrollTop: 0,
				lines: {
					updates: [{start: 0, end: totalLines, data}],
					totalLength: totalLines,
				},
			},
		]);

		await worker.render();
		await writeToTerm(term, output);
		output = '';

		// Scroll to line 50
		worker.update(tree, [
			{
				id: 'content',
				scrollTop: 50,
			},
		]);

		const checkViewport = (label: string) => {
			for (let i = 0; i < rows; i++) {
				const line = term.buffer.active.getLine(term.buffer.active.baseY + i);
				const lineText = line?.translateToString(true);
				t.truthy(lineText, `${label}: Line ${i} should not be undefined`);
				// We expect each line to contain "Line" followed by a number
				t.true(lineText?.includes('Line'), `${label}: Line ${i} should contain "Line", got: "${lineText}"`);
			}
		};

		// Tick several more times
		for (let tick = 1; tick <= 10; tick++) {
			await clock.tickAsync(10);
			await writeToTerm(term, output);
			output = '';
			checkViewport(`Tick ${tick}`);
		}
	} finally {
		clock.uninstall();
	}
});
