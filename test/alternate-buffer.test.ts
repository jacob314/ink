import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import ansiEscapes from 'ansi-escapes';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {
	writeToTerm,
	createStyledChar,
	createStyledLine,
} from './helpers/replay-lib.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {Terminal: XtermTerminal} = xtermHeadless;
const serializer = new Serializer();

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

	let appliedChanges = worker.update(tree, []);
	if (appliedChanges) {
		await worker.render();
	}

	await writeToTerm(term, output);
	output = '';

	t.is(term.buffer.active.type, 'alternate');

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

test('switching back from alternate buffer does NOT trigger a full render clear', async t => {
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

	worker.update({id: 'root', children: []}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: 1,
			lines: {
				updates: [],
				totalLength: 0,
			},
		},
	]);
	await worker.render();
	output = '';

	worker.updateOptions({isAlternateBufferEnabled: true});
	await worker.render();
	output = '';

	worker.updateOptions({isAlternateBufferEnabled: false});
	await worker.render();

	t.falsy(
		worker.fullRenderTimeout,
		'Full render should NOT be scheduled when exiting alternate buffer',
	);

	const hadClearInInitialRender =
		output.includes(ansiEscapes.eraseScreen) ||
		output.includes(ansiEscapes.clearTerminal);
	t.false(hadClearInInitialRender, 'Should not have cleared');
	output = '';

	await new Promise(resolve => {
		setTimeout(resolve, 1100);
	});

	const hadClearLater =
		output.includes(ansiEscapes.eraseScreen) ||
		output.includes(ansiEscapes.clearTerminal);
	t.false(hadClearLater, 'Should still not have cleared even after 1.1s');
});

test('TerminalBufferWorker handles alternate buffer toggle correctly with new content', async t => {
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

	worker.updateOptions({isAlternateBufferEnabled: true});
	await worker.render();
	await writeToTerm(term, output);
	output = '';

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

	worker.updateOptions({isAlternateBufferEnabled: false});
	await worker.render();
	await writeToTerm(term, output);
	output = '';

	t.is(
		term.buffer.active
			.getLine(term.buffer.active.baseY + 0)
			?.translateToString(true),
		'Alternate Mode Content',
	);
});
