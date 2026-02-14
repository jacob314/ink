import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
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

const writeToTerm = (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('TerminalBufferWorker handles alternate buffer toggle correctly', async t => {
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

	// 1. Initial render in normal buffer
	const linesNormal = [createStyledLine('Normal Mode Content')];
	const dataNormal = serializer.serialize(linesNormal);

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 1,
			lines: {
				updates: [{start: 0, end: 1, data: dataNormal}],
				totalLength: 1,
			},
		},
	]);
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(
		term.buffer.active
			.getLine(term.buffer.active.baseY + 0)
			?.translateToString(true),
		'Normal Mode Content',
	);

	// 2. Toggle to alternate buffer
	worker.updateOptions({isAlternateBufferEnabled: true});
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	// Verify we are in alternate buffer
	t.is(term.buffer.active.type, 'alternate');
	// In the current broken state, this might be blank because we don't force a full rerender on the new writer
	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Normal Mode Content',
		'Content should be visible in alternate buffer',
	);

	// 3. Update content in alternate buffer
	const linesAlt = [createStyledLine('Alternate Mode Content')];
	const dataAlt = serializer.serialize(linesAlt);
	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			height: 1,
			lines: {
				updates: [{start: 0, end: 1, data: dataAlt}],
				totalLength: 1,
			},
		},
	]);
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Alternate Mode Content',
	);

	// 4. Toggle back to normal buffer
	worker.updateOptions({isAlternateBufferEnabled: false});
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	// Verify we are back in normal buffer
	t.is(term.buffer.active.type, 'normal');

	// The content should match the latest state known to the worker
	t.is(
		term.buffer.active
			.getLine(term.buffer.active.baseY + 0)
			?.translateToString(true),
		'Alternate Mode Content',
		'Content should be restored correctly in normal buffer',
	);

	// 5. Toggle to alternate buffer AGAIN (this used to crash)
	worker.updateOptions({isAlternateBufferEnabled: true});
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.type, 'alternate');
	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Alternate Mode Content',
		'Content should be visible in alternate buffer after second toggle',
	);
});
