import process from 'node:process';
import {TerminalBufferWorker} from './render-worker.js';

let buffer: TerminalBufferWorker;

const main = () => {
	process.on('message', (message: any) => {
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
					void buffer.render();
				}

				break;
			}

			case 'done': {
				if (buffer) {
					buffer.done();
				}

				break;
			}

			case 'getLinesUpdated': {
				if (buffer) {
					process.send?.({
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
