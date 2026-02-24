import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {
	createWorkerAndTerminal,
	captureTerminalState,
	loadReplayData,
} from '../helpers/replay-lib.js';

const scriptFilename = fileURLToPath(import.meta.url);
const replayDir = path.dirname(scriptFilename);

test('Magic stretch: sticky-scroll-demo resizes correctly', async t => {
	const replayFile = 'sticky-scroll-demo.json';
	const replay = loadReplayData(replayDir, replayFile);
	const {columns, rows} = replay;
	// Original columns: 181

	const {worker, term, getOutput} = createWorkerAndTerminal(columns, rows);

	for (const frame of replay.frames) {
		worker.update(frame.tree, frame.updates, frame.cursorPosition);
		// eslint-disable-next-line no-await-in-loop
		await worker.render();
	}

	// 1. Resize NARROWER (141)
	const narrowColumns = 141;
	term.resize(narrowColumns, rows);
	worker.resize(narrowColumns, rows);
	await worker.waitForIdle();

	const narrowOutput = await captureTerminalState(term, getOutput());
	const narrowLines = narrowOutput.split('\n');

	// Box 0 should be present
	const box0Line = narrowLines.find(l => l.includes('box 0 with yellow text'));
	if (box0Line) {
		t.pass('Box 0 found');
	} else {
		t.fail('Box 0 not found in narrow output');
	}

	// 2. Resize WIDER back to 181
	const wideColumns = 181;
	term.resize(wideColumns, rows);
	worker.resize(wideColumns, rows);
	await worker.waitForIdle();

	const wideOutput = await captureTerminalState(term, getOutput());
	const wideLines = wideOutput.split('\n');

	const wideBoxLine = wideLines.find(
		l => l.trim().startsWith('╭') && l.trim().endsWith('╮'),
	);

	if (wideBoxLine) {
		t.true(
			wideBoxLine.length >= 179,
			'Box line should stretch to at least 179',
		);
	} else {
		t.fail('Could not find box top line in wide output');
	}
});
