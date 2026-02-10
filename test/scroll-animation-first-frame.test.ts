import test from 'ava';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal: XtermTerminal} = xtermHeadless;

const serializer = new Serializer();

const createStyledChar = (char: string) => ({
	type: 'char' as const,
	value: char,
	fullWidth: false,
	styles: [],
});

const createStyledLine = (text: string) =>
	[...text].map(char => createStyledChar(char));

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('TerminalBufferWorker should not animate scroll on first frame of a region', async t => {
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

	// Enable animated scroll
	const worker = new TerminalBufferWorker(columns, rows, {
		stdout,
		animatedScroll: true,
	});
	const term = new XtermTerminal({
		cols: columns,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	// Create a region with 20 lines of content
	const lines = Array.from({length: 20}, (_, i) => createStyledLine(`Line ${i + 1}`));
	const data = serializer.serialize(lines);

	// First update for this region, setting scrollTop to 10
	worker.update({id: 'scroll-region', children: []}, [
		{
			id: 'scroll-region',
			x: 0,
			y: 0,
			width: columns,
			height: 10,
			isScrollable: true,
			isVerticallyScrollable: true,
			scrollTop: 10,
			scrollHeight: 20,
			lines: {
				updates: [
					{
						start: 0,
						end: 20,
						data,
					},
				],
				totalLength: 20,
			},
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	// If it didn't animate, it should show "Line 11" at the top (scrollTop 10)
	// If it DID animate, it would show "Line 1" at the top (scrollTop 0) because animation hasn't ticked yet
	const firstLine = term.buffer.active.getLine(0)?.translateToString(true);
	t.is(firstLine, 'Line 11', 'Should immediately show Line 11 on the first frame');

	// Clear output for next render
	output = '';

	// Second update for the same region, changing scrollTop to 15
	worker.update({id: 'scroll-region', children: []}, [
		{
			id: 'scroll-region',
			scrollTop: 15,
		},
	]);

	await worker.render();
	await writeToTerm(term, output);

	// This time it SHOULD animate. So after one render() call (without animation ticks),
	// it should still show "Line 11".
	// If it animated, it shouldn't have jumped to Line 16 (scrollTop 15) yet.
	const firstLineAfterUpdate = term.buffer.active.getLine(0)?.translateToString(true);
	t.not(firstLineAfterUpdate, 'Line 16', 'Should NOT have jumped to Line 16 immediately on subsequent update');
	t.is(firstLineAfterUpdate, 'Line 11', 'Should still show Line 11 before animation ticks');
});
