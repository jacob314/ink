import process from 'node:process';
import {TerminalBufferWorker} from './render-worker.js';

let buffer: TerminalBufferWorker;

const main = () => {
	const safeSend = (message: any) => {
		if (process.connected && process.send) {
			try {
				process.send(message, undefined, undefined, error => {
					if (error) {
						// Error is often EPIPE when parent disconnects
					}
				});
			} catch {
				// Ignore
			}
		}
	};

	process.on('message', async (message: any) => {
		switch (message.type) {
			case 'init': {
				const columns = (process.stdout.columns || message.columns) as number;
				const rows = (process.stdout.rows || message.rows) as number;
				buffer = new TerminalBufferWorker(columns, rows, {
					debugRainbowEnabled: message.debugRainbowEnabled as boolean,
					isAlternateBufferEnabled: message.isAlternateBufferEnabled as boolean,
					stickyHeadersInBackbuffer:
						message.stickyHeadersInBackbuffer as boolean,
					animatedScroll: message.animatedScroll as boolean,
					animationInterval: message.animationInterval as number,
					backbufferUpdateDelay: message.backbufferUpdateDelay as number,
					maxScrollbackLength: message.maxScrollbackLength as number,
					forceScrollToBottomOnBackbufferRefresh:
						message.forceScrollToBottomOnBackbufferRefresh as boolean,
				});
				break;
			}

			case 'updateOptions': {
				if (buffer) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					buffer.updateOptions(message.options);
				}

				break;
			}

			case 'edits': {
				if (buffer) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					buffer.update(message.tree, message.updates, message.cursorPosition);
				}

				break;
			}

			case 'fullRender': {
				if (buffer) {
					void buffer.fullRender();
				}

				break;
			}

			case 'render': {
				if (buffer) {
					await buffer.render();
					safeSend({type: 'renderDone'});
				}

				break;
			}

			case 'done': {
				if (buffer) {
					buffer.done();
					safeSend({type: 'doneConfirmed'});
				}

				break;
			}

			case 'getLinesUpdated': {
				if (buffer) {
					safeSend({
						type: 'linesUpdated',
						count: buffer.getLinesUpdated(),
					});
				}

				break;
			}

			case 'resetLinesUpdated': {
				if (buffer) {
					buffer.resetLinesUpdated();
				}

				break;
			}

			case 'dumpCurrentFrame': {
				if (buffer) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					buffer.dumpCurrentFrame(message.filename);
				}

				break;
			}

			case 'waitForIdle': {
				if (buffer) {
					await buffer.waitForIdle();
					safeSend({type: 'idle'});
				}

				break;
			}

			default: {
				break;
			}
		}
	});

	process.stdout.on('resize', () => {
		if (buffer && process.stdout.columns && process.stdout.rows) {
			buffer.resize(process.stdout.columns, process.stdout.rows);
		}
	});
};

if (process.env['INK_WORKER'] === 'true') {
	main();
}
