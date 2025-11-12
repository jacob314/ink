import test from 'ava';
import ansiEscapes from 'ansi-escapes';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import logUpdate from '../src/log-update.js';
import createStdout from './helpers/create-stdout.js';

test('standard rendering - renders and updates output', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout);

	render('Hello');
	t.is((stdout.write as any).callCount, 1);
	t.is((stdout.write as any).firstCall.args[0], 'Hello\n');

	render('World');
	t.is((stdout.write as any).callCount, 2);
	t.true(
		((stdout.write as any).secondCall.args[0] as string).includes('World'),
	);
});

test('standard rendering - skips identical output', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout);

	render('Hello');
	render('Hello');

	t.is((stdout.write as any).callCount, 1);
});

test('incremental rendering - renders and updates output', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Hello');
	t.is((stdout.write as any).callCount, 1);
	t.is((stdout.write as any).firstCall.args[0], 'Hello\n');

	render('World');
	t.is((stdout.write as any).callCount, 2);
	t.true(
		((stdout.write as any).secondCall.args[0] as string).includes('World'),
	);
});

test('incremental rendering - skips identical output', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Hello');
	render('Hello');

	t.is((stdout.write as any).callCount, 1);
});

test('incremental rendering - surgical updates', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render('Line 1\nUpdated\nLine 3');

	const secondCall = (stdout.write as any).secondCall.args[0] as string;
	t.true(secondCall.includes(ansiEscapes.cursorNextLine)); // Skips unchanged lines
	t.true(secondCall.includes('Updated')); // Only updates changed line
	t.false(secondCall.includes('Line 1')); // Doesn't rewrite unchanged
	t.false(secondCall.includes('Line 3')); // Doesn't rewrite unchanged
});

test('incremental rendering - clears extra lines when output shrinks', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render('Line 1');

	const secondCall = (stdout.write as any).secondCall.args[0] as string;
	t.true(secondCall.includes(ansiEscapes.eraseLines(2))); // Erases 2 extra lines
});

test('incremental rendering - when output grows', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1');
	render('Line 1\nLine 2\nLine 3');

	const secondCall = (stdout.write as any).secondCall.args[0] as string;
	t.true(secondCall.includes(ansiEscapes.cursorNextLine)); // Skips unchanged first line
	t.true(secondCall.includes('Line 2')); // Adds new line
	t.true(secondCall.includes('Line 3')); // Adds new line
	t.false(secondCall.includes('Line 1')); // Doesn't rewrite unchanged
});

test('incremental rendering - single write call with multiple surgical updates', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render(
		'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10',
	);
	render(
		'Line 1\nUpdated 2\nLine 3\nUpdated 4\nLine 5\nUpdated 6\nLine 7\nUpdated 8\nLine 9\nUpdated 10',
	);

	t.is((stdout.write as any).callCount, 2); // Only 2 writes total (initial + update)
});

test('incremental rendering - shrinking output keeps screen tight', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render('Line 1\nLine 2');
	render('Line 1');

	const thirdCall = stdout.get();

	t.is(
		thirdCall,
		ansiEscapes.eraseLines(2) + // Erase Line 2 and ending cursorNextLine
			ansiEscapes.cursorUp(1) + // Move to beginning of Line 1
			ansiEscapes.cursorNextLine, // Move to next line after Line 1
	);
});

test('incremental rendering - clear() fully resets incremental state', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render.clear();
	render('Line 1');

	const afterClear = stdout.get();

	t.is(afterClear, ansiEscapes.eraseLines(0) + 'Line 1\n'); // Should do a fresh write
});

test('incremental rendering - done() resets before next render', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render.done();
	render('Line 1');

	const afterDone = stdout.get();

	t.is(afterDone, ansiEscapes.eraseLines(0) + 'Line 1\n'); // Should do a fresh write
});

test('incremental rendering - multiple consecutive clear() calls (should be harmless no-ops)', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render.clear();
	render.clear();
	render.clear();

	t.is((stdout.write as any).callCount, 4); // Initial render + 3 clears (each writes eraseLines)

	// Verify state is properly reset after multiple clears
	render('New content');
	const afterClears = stdout.get();
	t.is(afterClears, ansiEscapes.eraseLines(0) + 'New content\n'); // Should do a fresh write
});

test('incremental rendering - sync() followed by update (assert incremental path is used)', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render.sync('Line 1\nLine 2\nLine 3');
	t.is((stdout.write as any).callCount, 0); // The sync() call shouldn't write to stdout

	render('Line 1\nUpdated\nLine 3');
	t.is((stdout.write as any).callCount, 1);

	const firstCall = (stdout.write as any).firstCall.args[0] as string;
	t.true(firstCall.includes(ansiEscapes.cursorNextLine)); // Skips unchanged lines
	t.true(firstCall.includes('Updated')); // Only updates changed line
	t.false(firstCall.includes('Line 1')); // Doesn't rewrite unchanged
	t.false(firstCall.includes('Line 3')); // Doesn't rewrite unchanged
});

test('incremental rendering - render to empty string (full clear vs early exit)', t => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {incremental: true});

	render('Line 1\nLine 2\nLine 3');
	render('');

	t.is((stdout.write as any).callCount, 2);
	const secondCall = (stdout.write as any).secondCall.args[0] as string;
	t.is(secondCall, ansiEscapes.eraseLines(4) + '\n'); // Erases all 4 lines + writes single newline

	// Rendering empty string again should be skipped (identical output)
	render('');
	t.is((stdout.write as any).callCount, 2); // No additional write
});

test('incremental rendering - alternate buffer', t => {
	const stdout = createStdout();
	let rows = 10;
	const render = logUpdate.create(stdout, {
		incremental: true,
		alternateBuffer: true,
		getRows: () => rows,
	});

	render('Line 1\nLine 2', [] as StyledChar[][]);
	t.is((stdout.write as any).callCount, 3);
	const firstRender = (stdout.write as any).thirdCall.args[0] as string;
	t.true(firstRender.includes('Line 1\nLine 2'));

	render('Line 1\nUpdated', [] as StyledChar[][]);
	t.is((stdout.write as any).callCount, 4);
	const secondRender = (stdout.write as any).lastCall.args[0] as string;
	t.true(secondRender.includes(ansiEscapes.cursorNextLine)); // Skips Line 1
	t.true(secondRender.includes('Updated'));
	t.false(secondRender.includes('Line 1')); // Should not rewrite Line 1

	// Change rows to trigger full redraw
	rows = 5;
	render('Line 1\nUpdated Again', [] as StyledChar[][]);
	t.is((stdout.write as any).callCount, 5);
	const thirdRender = (stdout.write as any).lastCall.args[0] as string;
	// Should be a full redraw, so it should contain Line 1
	t.true(thirdRender.includes('Line 1'));
	t.true(thirdRender.includes('Updated Again'));
});
