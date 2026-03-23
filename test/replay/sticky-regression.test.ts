import fs from 'node:fs';
import test from 'ava';
import {TerminalBufferWorker} from '../../src/worker/render-worker.js';
import {loadReplay} from '../../src/replay.js';

test('sticky headers should not appear in backbuffer when stickyHeadersInBackbuffer is false', async t => {
	const content = fs.readFileSync('test/replay/sticky-regression.json', 'utf8');
	const replay = loadReplay(content);
	const worker = new TerminalBufferWorker(150, 60, {
		isAlternateBufferEnabled: false,
		stickyHeadersInBackbuffer: false,
		animatedScroll: false,
	});

	worker.update(
		replay.frames[0].tree,
		replay.frames[0].updates,
		replay.frames[0].cursorPosition,
	);
	await worker.waitForIdle();
	await worker.fullRender();
	await worker.waitForIdle();

	const state = worker.getExpectedState();

	const backbufferText = state.backbuffer.map(line => line.text).join('\n');
	t.false(
		backbufferText.includes('Sticky Header 1 (sticky top)'),
		'Backbuffer should not contain stuck header 1',
	);
	t.true(
		backbufferText.includes('Sticky Inner Header 0 (sticky top)'),
		'Backbuffer should contain stuck inner header 0',
	);

	const screenText = state.screen.map(line => line.text).join('\n');
	t.false(
		screenText.includes('Sticky Header 1 (sticky top)'),
		'Screen should not contain stuck header 1 (it scrolled into backbuffer)',
	);
	t.true(
		screenText.includes('Sticky Inner Header 3 (sticky top)'),
		'Screen should contain stuck inner header 3',
	);
});
