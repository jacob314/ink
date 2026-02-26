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

test('Full width boxes resize correctly in sticky example', async t => {
	const replayFile = 'sticky-fullwidth.json';
	const replay = loadReplayData(replayDir, replayFile);
	const {columns, rows} = replay;

	const {worker, term, getOutput} = createWorkerAndTerminal(columns, rows);

	for (const frame of replay.frames) {
		worker.update(frame.tree, frame.updates, frame.cursorPosition);
		await worker.render();
	}

	// 1. Resize WIDER (+20)
	const widerColumns = columns + 20;
	term.resize(widerColumns, rows);
	worker.resize(widerColumns, rows);
	await worker.waitForIdle();

	const wideOutput = await captureTerminalState(term, getOutput());
	const wideLines = wideOutput.split('\n');

	// Find the longest line that contains any box border character.
	const borderLines = wideLines.filter(l => /[┌╭└╰┐╮┘╯─│]/.test(l.replace(/\u001B\[[0-9;]*m/g, '')));
	const wideBoxLine = borderLines.reduce((a, b) => a.length > b.length ? a : b, '');

	if (!wideBoxLine) {
		console.log('WIDE LINES:', wideLines);
		t.fail('Could not find any box border line in wide output');
		return;
	}
	
	const plainLine = wideBoxLine.replace(/\u001B\[[0-9;]*m/g, '').trim();
	t.true(plainLine.length >= widerColumns - 5, `Longest border line length ${plainLine.length} should be close to ${widerColumns}`);

	// 2. Resize NARROWER (-20)
	const narrowColumns = columns - 20;
	term.resize(narrowColumns, rows);
	worker.resize(narrowColumns, rows);
	await worker.waitForIdle();

	const narrowOutput = await captureTerminalState(term, getOutput());
	const narrowLines = narrowOutput.split('\n');

	const narrowBorderLines = narrowLines.filter(l => /[┌╭└╰┐╮┘╯─│]/.test(l.replace(/\u001B\[[0-9;]*m/g, '')));
	const narrowBoxLine = narrowBorderLines.reduce((a, b) => a.length > b.length ? a : b, '');

	if (!narrowBoxLine) {
		t.fail('Could not find any box border line in narrow output');
		return;
	}
	const plainNarrowLine = narrowBoxLine.replace(/\u001B\[[0-9;]*m/g, '').trim();
	t.true(plainNarrowLine.length <= narrowColumns + 5 && plainNarrowLine.length >= narrowColumns - 10, `Narrowest longest border line length ${plainNarrowLine.length} should be close to ${narrowColumns}`);
});
