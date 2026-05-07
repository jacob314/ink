import test, {type ExecutionContext} from 'ava';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {Serializer} from '../src/serialization.js';
import {type RegionNode, type RegionUpdate} from '../src/output.js';
import {
	createStyledLine,
	createSilentStdout,
	getRenderedText,
	createListUpdates,
} from './helpers/replay-lib.js';

async function runBackbufferDeleteTest(
	t: ExecutionContext,
	maxScrollbackLength: number,
	expectDirty: boolean,
) {
	const columns = 80;
	const rows = 5;
	const worker = new TerminalBufferWorker(columns, rows, {
		stdout: createSilentStdout(columns, rows),
		maxScrollbackLength,
	});

	const rootNode: RegionNode = {
		id: 'root',
		children: [
			{
				id: 'list',
				children: [],
			},
		],
	};

	// Initial render: 20 lines total, scrolled down to 10
	worker.update(rootNode, createListUpdates(columns, rows, 20, 10, 0));
	await worker.render();

	t.false(worker.backbufferDirtyCurrentFrame);
	t.false(worker.backbufferDirty);

	// Now delete the first 5 lines
	// New state: 15 lines total, scrolled down to 5
	worker.update(rootNode, createListUpdates(columns, rows, 15, 5, 5));
	await worker.render();

	if (expectDirty) {
		t.true(worker.backbufferDirtyCurrentFrame || worker.backbufferDirty);
	} else {
		t.false(worker.backbufferDirtyCurrentFrame);
		t.false(worker.backbufferDirty);

		const state = worker.getExpectedState();
		t.is(state.backbuffer.length, 5);
		t.is(getRenderedText(state.backbuffer.at(-1)), 'Line 9');
	}
}

test('re-render is not triggered when lines above viewport are deleted and tail matches (small maxScrollbackLength)', async t => {
	await runBackbufferDeleteTest(t, 5, false);
});

test('re-render IS triggered when lines above viewport are deleted and fall within maxScrollbackLength', async t => {
	await runBackbufferDeleteTest(t, 20, true);
});
