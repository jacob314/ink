import test from 'ava';
import stripAnsi from 'strip-ansi';
import {run} from './helpers/run.js';

test('cursor is moved to the last line on exit', async t => {
	const output = await run('exit-cursor-position');

	// The output should contain 'exited'
	t.true(output.includes('exited'));

	const strippedOutput = stripAnsi(output);
	const lines = strippedOutput
		.split(/\r?\n/)
		.map(l => l.trim())
		.filter(l => l.length > 0);

	const inkLine0Index = lines.findIndex(l => l.includes('Line 0: 1'));
	const inkLine1Index = lines.findIndex(l => l.includes('Line 1'));
	const inkLine2Index = lines.findIndex(l => l.includes('Line 2'));
	const exitedIndex = lines.findIndex(l => l.includes('exited'));

	t.not(inkLine0Index, -1, 'Should find Line 0: 1');
	t.not(inkLine1Index, -1, 'Should find Line 1');
	t.not(inkLine2Index, -1, 'Should find Line 2');
	t.not(exitedIndex, -1, 'Should find exited');

	// In incremental rendering, when Line 0: 0 is updated to Line 0: 1,
	// if the cursor wasn't moved down on exit, 'exited' would be printed right after 'Line 0: 1'.
	// Because we moved the cursor to the bottom, it should appear after 'Line 2'.
	t.true(
		exitedIndex > inkLine2Index,
		`exited (index ${exitedIndex}) should be after Line 2 (index ${inkLine2Index})`,
	);
});
