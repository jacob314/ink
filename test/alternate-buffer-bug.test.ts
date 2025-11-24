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

const writeToTerm = async (term: Terminal, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('TerminalBufferWorker reproduction: blank screen on toggle if content unchanged', async t => {
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
	const lines = [createStyledLine('Persistent Content')];
	const data = serializer.serialize(lines);

	const tree = {id: 'root', children: []};
	const updates = [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 1,
			lines: {
				updates: [{start: 0, end: 1, data}],
				totalLength: 1,
			},
		},
	];

	worker.update(tree, updates);
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(
		term.buffer.active
			.getLine(term.buffer.active.baseY + 0)
			?.translateToString(true),
		'Persistent Content',
	);

	// 2. Toggle to alternate buffer
	worker.updateOptions({isAlternateBufferEnabled: true});

	// Simulate what Ink does: it calls update() then render()
	// But if content hasn't changed, updates might be empty.
	// However, here we pass the SAME tree and NO updates.
	let appliedChanges = worker.update(tree, []);
	if (appliedChanges) {
		await worker.render();
	}

	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.type, 'alternate');

	// With the fix, content should be correctly rendered even if tree/updates are empty
	t.is(
		term.buffer.active.getLine(0)?.translateToString(true),
		'Persistent Content',
		'Content should be visible in alternate buffer immediately after toggle',
	);

	// 3. Toggle back to normal buffer
	worker.updateOptions({isAlternateBufferEnabled: false});
	appliedChanges = worker.update(tree, []);
	if (appliedChanges) {
		await worker.render();
	}

	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.type, 'normal');
	t.is(
		term.buffer.active
			.getLine(term.buffer.active.baseY + 0)
			?.translateToString(true),
		'Persistent Content',
		'Content should be visible in normal buffer immediately after toggling back',
	);
});
