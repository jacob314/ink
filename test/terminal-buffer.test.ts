/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import test from 'ava';
import {stub} from 'sinon';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import TerminalBuffer from '../src/terminal-buffer.js';
import {type Region} from '../src/output.js';

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createLine = (text: string): StyledChar[] =>
	[...text].map(char => createStyledChar(char));

const createRegion = (lines: StyledChar[][]): Region => ({
	id: 'root',
	x: 0,
	y: 0,
	width: 100,
	height: 100,
	lines,
	isScrollable: false,
	stickyHeaders: [],
	children: [],
});

test('update - correctly diffs sequential updates', t => {
	const buffer = new TerminalBuffer(100, 100);
	const {worker} = buffer as any;
	const sendStub = stub(worker, 'send');

	// 1. Initial state: A, B, C
	const lines1 = [createLine('A'), createLine('B'), createLine('C')];
	buffer.update(0, 0, createRegion(lines1));

	t.true(sendStub.calledOnce);
	let call = sendStub.firstCall.args[0];
	t.is(call.type, 'edits');
	// New structure: tree, updates
	t.is(call.updates.length, 1);
	t.is(call.updates[0].id, 'root');
	const lineUpdates1 = call.updates[0].lines.updates;
	t.is(lineUpdates1.length, 1);
	// Full update
	t.is(lineUpdates1[0].start, 0);
	t.is(lineUpdates1[0].end, 3); // length of lines

	sendStub.resetHistory();

	// 2. Insert D between B and C -> A, B, D, C
	const lines2 = [
		createLine('A'),
		createLine('B'),
		createLine('D'),
		createLine('C'),
	];
	buffer.update(0, 0, createRegion(lines2));

	t.true(sendStub.calledOnce);
	call = sendStub.firstCall.args[0];
	t.is(call.type, 'edits');
	t.is(call.updates.length, 1);
	const lineUpdates2 = call.updates[0].lines.updates;

	// Diff logic:
	// 0: A=A
	// 1: B=B
	// 2: C!=D
	// 3: undefined!=C
	// So it detects change starting at index 2.
	// It should send update for index 2 and 3.
	// Start: 2, end: 4.
	// data: [D, C]

	t.is(lineUpdates2.length, 1);
	t.is(lineUpdates2[0].start, 2);
	t.is(lineUpdates2[0].end, 4);

	sendStub.resetHistory();

	// 3. Replace B with B, E -> A, B, E, D, C
	const lines3 = [
		createLine('A'),
		createLine('B'),
		createLine('E'),
		createLine('D'),
		createLine('C'),
	];
	buffer.update(0, 0, createRegion(lines3));

	t.true(sendStub.calledOnce);
	call = sendStub.firstCall.args[0];
	const lineUpdates3 = call.updates[0].lines.updates;

	// Diff logic:
	// 0,1 match.
	// 2: D!=E
	// 3: C!=D
	// 4: undefined!=C
	// Start: 2, end: 5.

	t.is(lineUpdates3.length, 1);
	t.is(lineUpdates3[0].start, 2);
	t.is(lineUpdates3[0].end, 5);
});
