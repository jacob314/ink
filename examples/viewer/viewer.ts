import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline';
import {parseArgs} from 'node:util';
import {TerminalBufferWorker} from '../../src/worker/render-worker.js';
import {loadReplay} from '../../src/worker/replay.js';

const {values, positionals} = parseArgs({
	args: process.argv.slice(2),
	options: {
		debugRainbow: {
			type: 'boolean',
		},
		'no-animatedScroll': {
			type: 'boolean',
		},
		'no-stickyHeaders': {
			type: 'boolean',
		},
		scrollTop: {
			type: 'string',
		},
		exit: {
			type: 'boolean',
		},
		alternateBuffer: {
			type: 'boolean',
		},
		maxScrollback: {
			type: 'string',
		},
		help: {
			type: 'boolean',
			short: 'h',
		},
	},
	allowPositionals: true,
});

if (values.help) {
	console.log(`
Usage: npx tsx examples/viewer/viewer.ts <replay.json> [options]

Options:
  --debugRainbow          Enable rainbow colors for debugging regions
  --no-animatedScroll     Disable animated scrolling
  --no-stickyHeaders      Disable sticky headers in backbuffer
  --scrollTop <number>    Initial scroll top position (single frame mode only)
  --exit                  Exit immediately after rendering
  --alternateBuffer       Enable alternate buffer mode
  --maxScrollback <number> Max scrollback length (default: 1000)
  -h, --help              Show this help message
`);
	process.exit(0);
}

const filename = positionals[0];
if (!filename) {
	console.error('Error: Missing replay.json argument');
	console.log('Usage: npx tsx examples/viewer/viewer.ts <replay.json> [options]');
	console.log('Run with --help for more information');
	process.exit(1);
}

const debugRainbowEnabled = Boolean(values.debugRainbow);
const animatedScroll = !values['no-animatedScroll'];
let stickyHeadersInBackbuffer = !values['no-stickyHeaders'];
const initialScrollTop = values.scrollTop
	? Number.parseInt(values.scrollTop as string, 10)
	: undefined;
const exitImmediately = Boolean(values.exit);
const isAlternateBufferEnabled = Boolean(values.alternateBuffer);
const maxScrollbackLength = values.maxScrollback
	? Number.parseInt(values.maxScrollback as string, 10)
	: undefined;

const replayData = loadReplay(fs.readFileSync(filename, 'utf8'));

// Initialize the worker out of process
const worker = new TerminalBufferWorker(replayData.columns, replayData.rows, {
	isAlternateBufferEnabled,
	stickyHeadersInBackbuffer,
	animatedScroll,
	debugRainbowEnabled,
	maxScrollbackLength,
});
let currentFrame = 0;

const renderFrame = async (frameIndex: number) => {
	const frame = replayData.frames[frameIndex];
	if (!frame) return;
	worker.update(frame.tree, frame.updates, frame.cursorPosition);
	await worker.render();
};

if (exitImmediately) {
	if (replayData.type === 'single') {
		await renderFrame(0);
		if (initialScrollTop !== undefined) {
			const scene = worker.getSceneManager();
			const regions = [...scene.regions.values()];
			const scrollRegion =
				regions.find(r => r.overflowToBackbuffer) ??
				regions.find(r => r.isScrollable);

			if (scrollRegion) {
				worker.update(
					replayData.frames[0]!.tree,
					[{id: scrollRegion.id, scrollTop: initialScrollTop}],
					replayData.frames[0]!.cursorPosition,
				);
				await worker.render();
			}
		}
	} else {
		await renderFrame(0);
	}

	worker.done();
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(0);
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
}

process.stdin.on('keypress', async (_string, key) => {
	if (key.ctrl && key.name === 'c') {
		worker.done();
		// eslint-disable-next-line unicorn/no-process-exit
		process.exit(0);
	}

	if (_string === 't') {
		stickyHeadersInBackbuffer = !stickyHeadersInBackbuffer;
		worker.updateOptions({stickyHeadersInBackbuffer});
		await worker.render();
	}

	if (replayData.type === 'single') {
		const frame = replayData.frames[0]!;
		const scene = worker.getSceneManager();
		const regions = [...scene.regions.values()];
		const scrollRegion =
			regions.find(r => r.overflowToBackbuffer) ??
			regions.find(r => r.isScrollable);

		if (scrollRegion) {
			let {scrollTop = 0, scrollHeight = 0, height = 0} = scrollRegion;
			const maxScroll = Math.max(0, scrollHeight - height);

			if (key.name === 'up') {
				scrollTop = Math.max(0, scrollTop - (key.shift ? 10 : 1));
			} else if (key.name === 'down') {
				scrollTop = Math.min(maxScroll, scrollTop + (key.shift ? 10 : 1));
			} else if (key.name === 'pageup' || _string === 'w') {
				scrollTop = Math.max(0, scrollTop - 100);
			} else if (key.name === 'pagedown' || _string === 's') {
				scrollTop = Math.min(maxScroll, scrollTop + 100);
			}

			worker.update(
				frame.tree,
				[{id: scrollRegion.id, scrollTop}],
				frame.cursorPosition,
			);
			await worker.render();
		}
	} else if (key.name === 'right' || key.name === 'space') {
		// Sequence replay
		currentFrame = Math.min(replayData.frames.length - 1, currentFrame + 1);
		await renderFrame(currentFrame);
	} else if (key.name === 'left') {
		currentFrame = Math.max(0, currentFrame - 1);
		// We must replay from start to currentFrame because updates are stateful diffs
		worker.getSceneManager().regions.clear();
		for (let i = 0; i <= currentFrame; i++) {
			await renderFrame(i);
		}
	}
});

// Clear console and execute initial render
console.clear();

if (replayData.type === 'single') {
	await renderFrame(0);
	process.stdout.write(
		'\n\n[Viewer]: Single frame loaded.\nControls:\n - Up/Down: Scroll by 1 line (Shift: 10 lines)\n - PageUp/PageDown (or W/S): Scroll by 100 lines\n - T: Toggle sticky headers\n - Ctrl+C: Exit\n',
	);
} else {
	await renderFrame(0);
	// We append instructions to the output since standard React layout is bypassed
	process.stdout.write(
		'\n\n[Viewer]: Sequence loaded.\nControls:\n - Space/Right Arrow: Advance frame\n - Left Arrow: Go back\n - T: Toggle sticky headers\n - Ctrl+C: Exit\n',
	);
}
