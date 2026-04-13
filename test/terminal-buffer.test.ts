/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import test from 'ava';
import {stub} from 'sinon';
import {type StyledLine} from '../src/styled-line.js';
import TerminalBuffer from '../src/terminal-buffer.js';
import {type Region} from '../src/output.js';

import {toStyledCharacters} from '../src/measure-text.js';
import {type StickyHeader} from '../src/dom.js';

const createLine = (text: string): StyledLine => toStyledCharacters(text);

const createRegion = (
	lines: StyledLine[],
	stickyHeaders: StickyHeader[] = [],
): Region => ({
	id: 'root',
	x: 0,
	y: 0,
	width: 100,
	height: 100,
	lines,
	isScrollable: false,
	stickyHeaders,
	children: [],
});

test('update - stickyHeadersEqual checks extended properties', t => {
	const buffer = new TerminalBuffer(100, 100);
	const {worker} = buffer as any;
	const sendStub = stub(worker, 'send');

	const baseHeader: StickyHeader = {
		nodeId: 1,
		lines: [createLine('A')],
		styledOutput: [createLine('A')],
		x: 0,
		y: 0,
		naturalRow: 0,
		startRow: 0,
		endRow: 1,
		scrollContainerId: 1,
		isStuckOnly: false,
		type: 'top',
		maxStuckY: undefined,
		minStuckY: undefined,
		relativeX: 0,
		relativeY: 0,
		height: 1,
		parentRelativeTop: 0,
		parentHeight: 10,
		parentBorderTop: 0,
		parentBorderBottom: 0,
	};

	const lines = [createLine('A')];

	// 1. Initial State
	buffer.update(0, 0, createRegion(lines, [baseHeader]));
	t.true(sendStub.calledOnce);
	sendStub.resetHistory();

	// 2. Same state -> no update
	t.false(buffer.update(0, 0, createRegion(lines, [baseHeader])));
	t.false(sendStub.called);
	sendStub.resetHistory();

	// 3. Mutate maxStuckY -> should trigger update
	const mutatedHeader1 = {...baseHeader, maxStuckY: 5};
	t.true(buffer.update(0, 0, createRegion(lines, [mutatedHeader1])));
	t.true(sendStub.calledOnce);
	sendStub.resetHistory();

	// 4. Mutate type -> should trigger update
	const mutatedHeader2 = {...baseHeader, type: 'bottom' as const};
	t.true(buffer.update(0, 0, createRegion(lines, [mutatedHeader2])));
	t.true(sendStub.calledOnce);
	sendStub.resetHistory();

	// 5. Mutate parentHeight -> should trigger update
	const mutatedHeader3 = {...baseHeader, parentHeight: 20};
	t.true(buffer.update(0, 0, createRegion(lines, [mutatedHeader3])));
	t.true(sendStub.calledOnce);
	sendStub.resetHistory();
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
	t.is(lineUpdates1[0].end, 3); // Length of lines

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
