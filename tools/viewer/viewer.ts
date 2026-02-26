import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline';
import {fork} from 'node:child_process';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import onExit from 'signal-exit';
import ansiEscapes from 'ansi-escapes';
import {loadReplay, type ReplayFrame} from '../../src/worker/replay.js';
import {type RegionUpdate} from '../../src/output.js';

const main = async () => {
	const argv = await yargs(hideBin(process.argv))
		.option('debugRainbow', {
			type: 'boolean',
			description: 'Enable rainbow colors for debugging regions',
			default: false,
		})
		.option('animatedScroll', {
			type: 'boolean',
			description: 'Enable animated scrolling',
			default: true,
		})
		.option('stickyHeaders', {
			type: 'boolean',
			description: 'Enable sticky headers in backbuffer',
			default: true,
		})
		.option('scrollTop', {
			type: 'number',
			description: 'Initial scroll top position',
		})
		.option('exit', {
			type: 'boolean',
			description: 'Exit immediately after rendering',
			default: false,
		})
		.option('alternateBuffer', {
			type: 'boolean',
			description: 'Enable alternate buffer mode',
			default: false,
		})
		.option('backbufferUpdateDelay', {
			type: 'number',
			description:
				'Delay in ms before rerendering the backbuffer if it is dirty',
		})
		.option('maxScrollback', {
			type: 'number',
			description: 'Max scrollback length',
			default: 1000,
		})
		.demandCommand(1, 'You must provide a replay.json file path')
		.strict()
		.help()
		.alias('help', 'h')
		.parse();

	const filename = argv._[0] as string;

	const debugRainbowEnabled = argv.debugRainbow;
	const {animatedScroll} = argv;
	let stickyHeadersInBackbuffer = argv.stickyHeaders;
	const initialScrollTop = argv.scrollTop;
	const exitImmediately = argv.exit;
	const isAlternateBufferEnabled = argv.alternateBuffer;
	const maxScrollbackLength = argv.maxScrollback;
	const {backbufferUpdateDelay} = argv;

	const replayData = loadReplay(fs.readFileSync(filename, 'utf8'));

	// Apply initial scroll top override if provided
	if (initialScrollTop !== undefined && replayData.frames.length > 0) {
		const frame = replayData.frames[0]!;
		const scrollRegionUpdate =
			frame.updates.find(u => u.overflowToBackbuffer) ??
			frame.updates.find(u => u.isScrollable);

		if (scrollRegionUpdate) {
			scrollRegionUpdate.scrollTop = initialScrollTop;
		}
	}

	// Initialize the worker out of process
	const workerUrl = new URL(
		'../../src/worker/worker-entry.ts',
		import.meta.url,
	);

	const worker = fork(workerUrl, {
		env: {
			...process.env,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			INK_WORKER: 'true',
		},
	});

	onExit(() => {
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
			process.stdin.pause();
		}

		process.stdout.write(ansiEscapes.cursorShow);

		if (isAlternateBufferEnabled) {
			process.stdout.write(ansiEscapes.exitAlternativeScreen);
		}

		if (worker && worker.connected) {
			worker.kill();
		}
	});

	worker.on('exit', code => {
		if (code !== 0) {
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(code ?? 1);
		}
	});

	worker.send({
		type: 'init',
		columns: replayData.columns,
		rows: replayData.rows,
		debugRainbowEnabled,
		isAlternateBufferEnabled,
		stickyHeadersInBackbuffer,
		animatedScroll,
		maxScrollbackLength,
		backbufferUpdateDelay,
	});

	let currentFrame = 0;

	const sendUpdate = (
		tree: ReplayFrame['tree'],
		updates: RegionUpdate[],
		cursorPosition: ReplayFrame['cursorPosition'],
	) => {
		try {
			worker.send({
				type: 'edits',
				tree,
				updates,
				cursorPosition,
			});
		} catch (error: any) {
			if (error.code === 'ERR_IPC_CHANNEL_CLOSED') {
				// eslint-disable-next-line unicorn/no-process-exit
				process.exit(1);
			}

			throw error;
		}
	};

	const renderQueue: Array<() => void> = [];

	worker.on('message', (message: any) => {
		if (message.type === 'doneConfirmed') {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
				process.stdin.pause();
			}

			setTimeout(() => {
				// eslint-disable-next-line unicorn/no-process-exit
				process.exit(0);
			}, 100);
		} else if (message.type === 'renderDone' || message.type === 'clearDone') {
			const resolve = renderQueue.shift();
			if (resolve) {
				resolve();
			}
		}
	});

	const renderAndWait = async () => {
		return new Promise<void>(resolve => {
			renderQueue.push(resolve);
			worker.send({type: 'render'});
		});
	};

	const clearAndWait = async () => {
		return new Promise<void>(resolve => {
			renderQueue.push(resolve);
			worker.send({type: 'clear'});
		});
	};

	const renderFrame = async (frameIndex: number) => {
		const frame = replayData.frames[frameIndex];
		if (!frame) return;
		sendUpdate(frame.tree, frame.updates, frame.cursorPosition);
		await renderAndWait();
	};

	if (exitImmediately) {
		await renderFrame(0);

		worker.send({type: 'done'});
		worker.on('exit', () => {
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(0);
		});
		// Give it a moment to flush if needed
		setTimeout(() => {
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(0);
		}, 100);
	} else {
		readline.emitKeypressEvents(process.stdin);
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}

		process.stdin.on('keypress', async (_string, key) => {
			if (key.ctrl && key.name === 'c') {
				worker.send({type: 'done'});
			}

			if (_string === 't') {
				stickyHeadersInBackbuffer = !stickyHeadersInBackbuffer;
				worker.send({
					type: 'updateOptions',
					options: {stickyHeadersInBackbuffer},
				});
				await renderAndWait();
			}

			if (replayData.type === 'single') {
				const frame = replayData.frames[0]!;
				const scrollRegionUpdate =
					frame.updates.find(u => u.overflowToBackbuffer) ??
					frame.updates.find(u => u.isScrollable);

				if (scrollRegionUpdate) {
					if ((scrollRegionUpdate as any)._localScrollTop === undefined) {
						(scrollRegionUpdate as any)._localScrollTop =
							scrollRegionUpdate.scrollTop ?? 0;
					}

					let scrollTop: number = (scrollRegionUpdate as any)._localScrollTop;
					const {scrollHeight = 0, height = 0} = scrollRegionUpdate;
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

					(scrollRegionUpdate as any)._localScrollTop = scrollTop;

					sendUpdate(
						frame.tree,
						[{id: scrollRegionUpdate.id, scrollTop}],
						frame.cursorPosition,
					);
					await renderAndWait();
				}
			} else if (key.name === 'right' || key.name === 'space') {
				// Sequence replay
				if (currentFrame < replayData.frames.length - 1) {
					currentFrame++;
					await renderFrame(currentFrame);
				}
			} else if (key.name === 'left') {
				if (currentFrame > 0) {
					currentFrame--;
					await clearAndWait();
					
					// Reconstruct state up to the current frame
					for (let i = 0; i <= currentFrame; i++) {
						const frame = replayData.frames[i]!;
						sendUpdate(frame.tree, frame.updates, frame.cursorPosition);
					}
					
					// Render once after reconstructing state
					await renderAndWait();
				}
			} else if (_string === 'p') {
				// Play the whole recording
				currentFrame = 0;
				await clearAndWait();
				const startWallTime = Date.now();
				const startTimestamp = replayData.frames[0]?.timestamp ?? 0;

				for (let i = 0; i < replayData.frames.length; i++) {
					currentFrame = i;
					const frame = replayData.frames[i]!;
					const elapsedSinceStart = frame.timestamp - startTimestamp;
					const targetWallTime = startWallTime + elapsedSinceStart;
					const now = Date.now();

					if (targetWallTime > now) {
						// eslint-disable-next-line no-await-in-loop
						await new Promise(resolve =>
							setTimeout(resolve, targetWallTime - now),
						);
					}

					// eslint-disable-next-line no-await-in-loop
					await renderFrame(i);
				}
			}
		});

		// Execute initial render
		await renderFrame(0);
	}
};

main();
