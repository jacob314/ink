import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {loadReplayData} from '../helpers/replay-lib.js';
import {createXtermRenderer, type XtermStdout} from '../helpers/render.js';
import {TerminalBufferWorker} from '../../src/worker/render-worker.js';

const scriptFilename = fileURLToPath(import.meta.url);
const replayDir = path.dirname(scriptFilename);

// Find all JSON files in the replay directory
const replayFiles = fs
	.readdirSync(replayDir)
	.filter(file => file.endsWith('.json') && !file.includes('dump'));

for (const replayFile of replayFiles) {
	test(`Replay snapshot: ${replayFile}`, async t => {
		const replay = loadReplayData(replayDir, replayFile);
		const {columns, rows} = replay;
		const {stdout, writeQueue} = createXtermRenderer(columns, rows);

		const worker = new TerminalBufferWorker(columns, rows, {
			stdout: stdout as unknown as NodeJS.WriteStream,
			isAlternateBufferEnabled: false,
		});

		for (const frame of replay.frames) {
			worker.update(frame.tree, frame.updates, frame.cursorPosition);
			// eslint-disable-next-line no-await-in-loop
			await worker.render();
		}

		// Ensure all writes are processed
		await writeQueue.promise;

		const svg = stdout.generateSvg();

		const snapshotPath = path.join(
			replayDir,
			`${replayFile.replace('.json', '')}.snapshot.svg`,
		);

		const isUpdatingSnapshots =
			process.argv.includes('-u') ||
			process.argv.includes('--update-snapshots') ||
			Boolean(process.env['UPDATE_SNAPSHOTS']);

		if (isUpdatingSnapshots || !fs.existsSync(snapshotPath)) {
			fs.writeFileSync(snapshotPath, svg, 'utf8');
			t.pass();
		} else {
			const expected = fs.readFileSync(snapshotPath, 'utf8');
			t.is(svg, expected);
		}
	});
}
