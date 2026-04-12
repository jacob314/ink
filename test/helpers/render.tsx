import {EventEmitter} from 'node:events';
import {act} from 'react';
import xtermHeadless, {type Terminal} from '@xterm/headless';
import {
	render as inkRenderDirect,
	type Instance as InkInstance,
} from '../../src/index.js';
import {generateSvgForTerminal} from './svg.js';

// Configure React act environment for testing
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const {Terminal: XtermTerminal} = xtermHeadless;

type TerminalState = {
	terminal: Terminal;
	cols: number;
	rows: number;
};

export class XtermStdout extends EventEmitter {
	isTTY = true;
	private readonly state: TerminalState;
	private pendingWrites = 0;
	private renderCount = 0;
	private readonly queue: {promise: Promise<void>};

	constructor(state: TerminalState, queue: {promise: Promise<void>}) {
		super();
		this.state = state;
		this.queue = queue;
	}

	get columns() {
		return this.state.terminal.cols;
	}

	get rows() {
		return this.state.terminal.rows;
	}

	getColorDepth(): number {
		return 24;
	}

	write(data: string) {
		this.pendingWrites++;
		this.queue.promise = (async () => {
			await this.queue.promise;
			await new Promise<void>(resolve => {
				this.state.terminal.write(data, () => {
					resolve();
				});
			});
			this.pendingWrites--;
		})();

		return true;
	}

	clear() {
		this.state.terminal.reset();
	}

	dispose() {
		this.state.terminal.dispose();
	}

	onRender() {
		this.renderCount++;
		this.emit('render');
	}

	generateSvg(): string {
		return generateSvgForTerminal(this.state.terminal);
	}

	lastFrame(options: {allowEmpty?: boolean} = {}) {
		const buffer = this.state.terminal.buffer.active;
		const allLines: string[] = [];
		for (let i = 0; i < buffer.length; i++) {
			allLines.push(buffer.getLine(i)?.translateToString(true) ?? '');
		}

		const trimmed = [...allLines];
		while (trimmed.length > 0 && trimmed.at(-1) === '') {
			trimmed.pop();
		}

		const result = trimmed.join('\n');

		const normalized = result.replaceAll('\r\n', '\n');

		if (normalized === '' && !options.allowEmpty) {
			throw new Error(
				'lastFrame() returned an empty string. Ensure the component is rendering correctly.',
			);
		}

		return normalized === '' ? normalized : normalized + '\n';
	}

	async waitUntilReady() {
		const startRenderCount = this.renderCount;
		// Give Ink a chance to start its rendering loop
		await new Promise(resolve => {
			setImmediate(resolve);
		});

		await act(async () => {
			// Wait for at least one render to be called if we haven't rendered yet or since start of this call,
			// but don't wait forever as some renders might be synchronous or skipped.
			if (this.renderCount === startRenderCount) {
				const renderPromise = new Promise(resolve => {
					this.once('render', resolve);
				});
				const timeoutPromise = new Promise(resolve => {
					setTimeout(resolve, 50);
				});
				await Promise.race([renderPromise, timeoutPromise]);
			}
		});

		let attempts = 0;
		const maxAttempts = 50;
		let lastObservedRenderCount = this.renderCount;
		let stableRenderChecks = 0;

		while (attempts < maxAttempts) {
			// Ensure all pending writes to the terminal are processed.
			// eslint-disable-next-line no-await-in-loop
			await this.queue.promise;

			if (this.pendingWrites === 0 && this.renderCount > 0) {
				if (this.renderCount === lastObservedRenderCount) {
					stableRenderChecks++;
				} else {
					lastObservedRenderCount = this.renderCount;
					stableRenderChecks = 0;
				}

				if (stableRenderChecks >= 2) {
					return;
				}
			} else {
				lastObservedRenderCount = this.renderCount;
				stableRenderChecks = 0;
			}

			attempts++;
			// eslint-disable-next-line no-await-in-loop
			await act(async () => {
				await new Promise(resolve => {
					setTimeout(resolve, 10);
				});
			});
		}

		throw new Error(
			`waitUntilReady() timed out after ${maxAttempts} attempts.\n` +
				`Pending writes: ${this.pendingWrites}\n` +
				`Render count: ${this.renderCount}`,
		);
	}
}

export class XtermStderr extends EventEmitter {
	isTTY = true;
	private readonly state: TerminalState;
	private pendingWrites = 0;
	private readonly queue: {promise: Promise<void>};

	constructor(state: TerminalState, queue: {promise: Promise<void>}) {
		super();
		this.state = state;
		this.queue = queue;
	}

	write(data: string) {
		this.pendingWrites++;
		this.queue.promise = (async () => {
			await this.queue.promise;
			await new Promise<void>(resolve => {
				this.state.terminal.write(data, () => {
					resolve();
				});
			});
			this.pendingWrites--;
		})();

		return true;
	}

	dispose() {
		this.state.terminal.dispose();
	}

	lastFrame() {
		return '';
	}
}

export class XtermStdin extends EventEmitter {
	isTTY = true;
	private readonly dataBuffer: string[] = [];

	constructor({isTty = true}: {isTty?: boolean} = {}) {
		super();
		this.isTTY = isTty;
	}

	write(data: string) {
		act(() => {
			this.dataBuffer.push(data);
			this.emit('data', data);
			this.emit('readable');
		});
	}

	setEncoding() {}
	setRawMode() {}
	resume() {}
	pause() {}
	ref() {}
	unref() {}

	override addListener(
		event: string | symbol,
		listener: (...args: any[]) => void,
	) {
		return this.on(event, listener);
	}

	override removeListener(
		event: string | symbol,
		listener: (...args: any[]) => void,
	) {
		return this.off(event, listener);
	}

	read() {
		return this.dataBuffer.shift() ?? null;
	}
}

export type RenderInstance = {
	rerender: (tree: React.ReactElement) => Promise<void>;
	unmount: () => Promise<void>;
	cleanup: () => void;
	stdout: XtermStdout;
	stderr: XtermStderr;
	stdin: XtermStdin;
	frames: string[];
	lastFrame: (options?: {allowEmpty?: boolean}) => string;
	generateSvg: () => string;
	terminal: Terminal;
	waitUntilReady: () => Promise<void>;
};

const instances: InkInstance[] = [];

export const render = async (
	tree: React.ReactElement,
	terminalWidth = 100,
	options: Partial<Parameters<typeof inkRenderDirect>[1]> & {
		terminalHeight?: number;
	} = {},
): Promise<RenderInstance> => {
	const cols = terminalWidth;
	const rows = options.terminalHeight ?? 50;
	const terminal = new XtermTerminal({
		cols,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const state: TerminalState = {
		terminal,
		cols,
		rows,
	};
	const writeQueue = {promise: Promise.resolve()};
	const stdout = new XtermStdout(state, writeQueue);
	const stderr = new XtermStderr(state, writeQueue);
	const stdin = new XtermStdin();

	let instance!: InkInstance;
	stdout.clear();
	act(() => {
		instance = inkRenderDirect(tree, {
			stdout: stdout as unknown as NodeJS.WriteStream,
			stderr: stderr as unknown as NodeJS.WriteStream,
			stdin: stdin as unknown as NodeJS.ReadStream,
			debug: false,
			exitOnCtrlC: false,
			patchConsole: false,
			...options,
			onRender(metrics) {
				stdout.onRender();
				if (typeof options.onRender === 'function') {
					const onRenderOption = options.onRender as (metrics: unknown) => void;
					onRenderOption(metrics);
				}
			},
		});
	});

	instances.push(instance);

	return {
		async rerender(newTree: React.ReactElement) {
			act(() => {
				stdout.clear();
				instance.rerender(newTree);
			});
		},
		async unmount() {
			await act(async () => {
				instance.unmount();
			});
			stdout.dispose();
			stderr.dispose();
		},
		cleanup() {
			instance.cleanup();
		},
		stdout,
		stderr,
		stdin,
		frames: [],
		lastFrame: (options?: {allowEmpty?: boolean}) => stdout.lastFrame(options),
		generateSvg: () => stdout.generateSvg(),
		terminal: state.terminal,
		waitUntilReady: async () => stdout.waitUntilReady(),
	};
};

export const cleanup = async () => {
	for (const instance of instances) {
		// eslint-disable-next-line no-await-in-loop
		await act(async () => {
			instance.unmount();
		});
		instance.cleanup();
	}

	instances.length = 0;
};

export function createXtermRenderer(cols: number, rows: number) {
	const terminal = new XtermTerminal({
		cols,
		rows,
		allowProposedApi: true,
		convertEol: true,
	});

	const state = {
		terminal,
		cols,
		rows,
	};
	const writeQueue = {promise: Promise.resolve()};
	const stdout = new XtermStdout(state, writeQueue);
	return {stdout, terminal, writeQueue};
}
