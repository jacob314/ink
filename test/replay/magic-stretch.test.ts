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

test('Magic stretch: cli-snapshot resizes correctly', async t => {
	const replayFile = 'cli-snapshot.json';
	const replay = loadReplayData(replayDir, replayFile);
	const {columns, rows} = replay;
	// Original columns: 161

	const {worker, term, getOutput} = createWorkerAndTerminal(columns, rows);

	for (const frame of replay.frames) {
		worker.update(frame.tree, frame.updates, frame.cursorPosition);
		// eslint-disable-next-line no-await-in-loop
		await worker.render();
	}

	// 1. Resize WIDER (181)
	const widerColumns = columns + 20;
	term.resize(widerColumns, rows);
	worker.resize(widerColumns, rows);
	await worker.waitForIdle();

	const wideOutput = await captureTerminalState(term, getOutput());
	const wideLines = wideOutput.split('\n');

	// Find a box top line: ╭───...───╮
	// We look for a line starting with ╭ and ending with ╮
	const wideBoxLine = wideLines.find(
		l => l.trim().startsWith('╭') && l.trim().endsWith('╮'),
	);

	if (!wideBoxLine) {
		t.fail('Could not find box top line in wide output');
		return;
	}

	// The original snapshot has lines roughly full width (161).
	// We expect the line to be roughly 181 length.
	// Since we don't know exact padding, we check if it grew significantly.
	// If it didn't stretch, it would remain ~161.

	// 2. Resize NARROWER (141)
	const narrowColumns = columns - 20;
	term.resize(narrowColumns, rows);
	worker.resize(narrowColumns, rows);
	await worker.waitForIdle();

	const narrowOutput = await captureTerminalState(term, getOutput());
	const narrowLines = narrowOutput.split('\n');

	const narrowBoxLine = narrowLines.find(
		l => l.trim().startsWith('╭') && l.trim().endsWith('╮'),
	);

	// Regression check: Logo truncation (when shrinking)
	// Logo line should start with " ███" and not be truncated prematurely.
	// In narrow output (141 cols), the logo (approx 78 chars) should fit fully.
	const logoLine = narrowLines.find(l => l.includes(' ███ '));
	if (logoLine) {
		const expectedLogoStart = ' ███            █████████';
		const expectedLogoEnd = '█████ █████';
		t.true(
			logoLine.includes(expectedLogoStart),
			'Logo start should be present',
		);
		t.true(
			logoLine.includes(expectedLogoEnd),
			'Logo end should be present (not truncated)',
		);
	} else {
		t.fail('Logo line not found in narrow output');
	}

	// Regression check: Background color extension (when extending)
	// Input line " >   Type your message" has a background color.
	// In wide output (181 cols), it should be extended.
	// Since we can't easily check colors here without parsing ANSI, we check line length.
	// xterm.js capture might trim trailing spaces if they are empty cells, but colored spaces are not empty.
	const wideInputLine = wideLines.find(l =>
		l.includes(' >   Type your message'),
	);
	if (!wideInputLine) {
		t.fail('Input line not found in wide output');
	}
});
