import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {
	createWorkerAndTerminal,
	captureTerminalState,
	loadReplayData,
	writeToTerm,
	waitForTerminalState,
} from '../helpers/replay-lib.js';

const scriptFilename = fileURLToPath(import.meta.url);
const replayDir = path.dirname(scriptFilename);

const testCases = [
	{name: 'sticky-on', stickyHeaders: true},
	{name: 'sticky-off', stickyHeaders: false},
	{name: 'narrow-sticky-on', stickyHeaders: true, width: 60},
	{name: 'narrow-sticky-off', stickyHeaders: false, width: 60},
	{name: 'alternate-sticky', stickyHeaders: true, alternateBuffer: true},
];

for (const {name, stickyHeaders, width, alternateBuffer} of testCases) {
	test(`Scroll snapshot: ${name}`, async t => {
		const replayFile = 'scroll-demo.json';
		const replay = loadReplayData(replayDir, replayFile);

		const columns = width ?? replay.columns;
		const {rows} = replay;

		// Enable sticky headers in backbuffer based on test case
		const {worker, term, getOutput, clearOutput} = createWorkerAndTerminal(
			columns,
			rows,
			{
				stickyHeadersInBackbuffer: stickyHeaders,
				isAlternateBufferEnabled: alternateBuffer,
			},
		);

		// Load the initial frame (assuming single frame or we take the first one)
		const frame = replay.frames[0];
		if (!frame) {
			t.fail('No frames in replay');
			return;
		}

		// Initial render
		worker.update(frame.tree, frame.updates, frame.cursorPosition);
		
		// Find the scrollable region
		const scene = worker.getSceneManager();
		const regions = [...scene.regions.values()];
		const scrollRegion =
			regions.find(r => r.overflowToBackbuffer) ??
			regions.find(r => r.isScrollable);

		if (!scrollRegion) {
			t.fail('No scroll region found in replay');
			return;
		}

		// Force scrollTop to 0 for initial render to avoid pushing history
		worker.update(frame.tree, [{id: scrollRegion.id, scrollTop: 0}], frame.cursorPosition);
		await worker.render();
		await worker.waitForIdle();
		await writeToTerm(term, getOutput());
		clearOutput();


		const {scrollHeight, height} = scrollRegion;
		const maxScroll = Math.max(0, scrollHeight - height);

		const scrollDir = path.join(replayDir, 'scroll');
		if (!fs.existsSync(scrollDir)) {
			fs.mkdirSync(scrollDir, {recursive: true});
		}

		const scrollOffsets = new Set<number>();
		for (let scrollTop = 0; scrollTop <= maxScroll; scrollTop += 10) {
			scrollOffsets.add(scrollTop);
		}

		scrollOffsets.add(maxScroll);

		const sortedOffsets = [...scrollOffsets].sort((a, b) => a - b);

		for (const scrollTop of sortedOffsets) {
			worker.update(
				frame.tree,
				[{id: scrollRegion.id, scrollTop}],
				frame.cursorPosition,
			);
			// eslint-disable-next-line no-await-in-loop
			await worker.render();

			// eslint-disable-next-line no-await-in-loop
			await worker.waitForIdle();

			// Capture the output of this update
			const output = getOutput();
			clearOutput();
			// eslint-disable-next-line no-await-in-loop
			await writeToTerm(term, output);
			// eslint-disable-next-line no-await-in-loop
			await waitForTerminalState(term, worker);

			// eslint-disable-next-line no-await-in-loop
			const termOutput = await captureTerminalState(term, '', {
				logDebugInfo: true,
			});

			const backbufferHeight = term.buffer.active.viewportY;
			if (alternateBuffer) {
				t.is(
					backbufferHeight,
					0,
					`Backbuffer should be empty in alternate buffer mode at scrollTop ${scrollTop}`,
				);
			} else {
				t.is(
					backbufferHeight,
					scrollTop,
					`Backbuffer height should match scrollTop ${scrollTop}`,
				);
			}

			const snapshotPath = path.join(
				scrollDir,
				`${replayFile.replace('.json', '')}.${name}.scroll_${scrollTop}.snapshot.txt`,
			);

			const isUpdatingSnapshots =
				process.argv.includes('-u') ||
				process.argv.includes('--update-snapshots') ||
				Boolean(process.env['UPDATE_SNAPSHOTS']);

			if (isUpdatingSnapshots || !fs.existsSync(snapshotPath)) {
				fs.writeFileSync(snapshotPath, termOutput, 'utf8');
				t.pass();
			} else {
				const expected = fs.readFileSync(snapshotPath, 'utf8');
				t.is(termOutput, expected, `Scroll top ${scrollTop} mismatch`);
			}
		}
	});
}
