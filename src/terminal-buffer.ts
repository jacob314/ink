import process from 'node:process';
import {fork, type ChildProcess} from 'node:child_process';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {Serializer} from './serialization.js';
import {TerminalBufferWorker} from './worker/render-worker.js';
import {type Region, type RegionUpdate, type RegionNode, flattenRegion} from './output.js';
import {type InkOptions} from './components/AppContext.js';
import {type DOMElement} from './dom.js';

const debugEdits = false;

export default class TerminalBuffer {
	public lines: StyledChar[][] = [];
	private readonly serializer = new Serializer();
	private readonly worker?: ChildProcess;
	private readonly workerInstance?: TerminalBufferWorker;
	private readonly resizeListener?: () => void;

	// Track previous state of all regions by ID
	private lastRegions = new Map<string | number, Region>();
	private lastNodeIdToElement = new Map<number, DOMElement>();
	private lastCursorPosition?: {row: number; col: number};

	private lastOptions?: InkOptions;
	private optionsChanged = false;

	constructor(
		columns: number,
		rows: number,
		options?: {
			debugRainbowEnabled?: boolean;
			renderInProcess?: boolean;
			stdout?: NodeJS.WriteStream;
			isAlternateBufferEnabled?: boolean;
			stickyHeadersInBackbuffer?: boolean;
			animatedScroll?: boolean;
			animationInterval?: number;
			backbufferUpdateDelay?: number;
			maxScrollbackLength?: number;
		},
	) {
		this.lastOptions = {
			isAlternateBufferEnabled: options?.isAlternateBufferEnabled,
			stickyHeadersInBackbuffer: options?.stickyHeadersInBackbuffer,
			animatedScroll: options?.animatedScroll,
			animationInterval: options?.animationInterval,
			backbufferUpdateDelay: options?.backbufferUpdateDelay,
			maxScrollbackLength: options?.maxScrollbackLength,
		};
		if (options?.renderInProcess) {
			this.workerInstance = new TerminalBufferWorker(columns, rows, {
				debugRainbowEnabled: options?.debugRainbowEnabled,
				stdout: options?.stdout,
				isAlternateBufferEnabled: options?.isAlternateBufferEnabled,
				stickyHeadersInBackbuffer: options?.stickyHeadersInBackbuffer,
				animatedScroll: options?.animatedScroll,
				animationInterval: options?.animationInterval,
				backbufferUpdateDelay: options?.backbufferUpdateDelay,
				maxScrollbackLength: options?.maxScrollbackLength,
			});
			void this.workerInstance.render();

			this.resizeListener = () => {
				if (
					this.workerInstance &&
					process.stdout.columns &&
					process.stdout.rows
				) {
					this.workerInstance.resize(
						process.stdout.columns,
						process.stdout.rows,
					);
				}
			};

			process.stdout.on('resize', this.resizeListener);
		} else {
			const workerUrl = new URL('worker/worker-entry.js', import.meta.url);

			this.worker = fork(workerUrl, {
				env: {
					...process.env,
					// eslint-disable-next-line @typescript-eslint/naming-convention
					INK_WORKER: 'true',
				},
			});

			this.worker.on('error', () => {
				// Silently ignore worker errors (e.g. EPIPE on exit)
			});

			this.worker.send({
				type: 'init',
				columns,
				rows,
				debugRainbowEnabled: options?.debugRainbowEnabled,
				isAlternateBufferEnabled: options?.isAlternateBufferEnabled,
				stickyHeadersInBackbuffer: options?.stickyHeadersInBackbuffer,
				animatedScroll: options?.animatedScroll,
				animationInterval: options?.animationInterval,
				backbufferUpdateDelay: options?.backbufferUpdateDelay,
				maxScrollbackLength: options?.maxScrollbackLength,
			});
		}
	}

	updateOptions(options: InkOptions) {
		if (
			options.isAlternateBufferEnabled !==
				this.lastOptions?.isAlternateBufferEnabled ||
			options.stickyHeadersInBackbuffer !==
				this.lastOptions?.stickyHeadersInBackbuffer ||
			options.animatedScroll !== this.lastOptions?.animatedScroll ||
			options.animationInterval !== this.lastOptions?.animationInterval ||
			options.backbufferUpdateDelay !==
				this.lastOptions?.backbufferUpdateDelay ||
			options.maxScrollbackLength !== this.lastOptions?.maxScrollbackLength
		) {
			this.optionsChanged = true;
		}

		this.lastOptions = {...options};

		if (this.workerInstance) {
			this.workerInstance.updateOptions(options);
		} else if (this.worker?.connected) {
			try {
				this.worker.send({
					type: 'updateOptions',
					options,
				});
			} catch (error) {
				console.error('Failed to send updateOptions message to worker:', error);
			}
		}
	}

	update(
		_start: number,
		_end: number,
		root: Region,
		cursorPosition?: {row: number; col: number},
	): boolean {
		this.lines = flattenRegion(root, {
			skipScrollbars: true,
			skipStickyHeaders: true,
		});
		const currentRegionsMap = new Map<string | number, Region>();
		const nodeIdToElement = new Map<number, DOMElement>();
		const updates: RegionUpdate[] = [];

		// Traverse tree to collect all current regions and build structure
		const buildTree = (r: Region): RegionNode => {
			currentRegionsMap.set(r.id, r);

			// Populate nodeIdToElement map
			if (r.nodeId !== undefined && r.node !== undefined) {
				nodeIdToElement.set(r.nodeId, r.node);
			}

			// Diff this region
			const update = this.diffRegion(r, nodeIdToElement);

			if (update) {
				updates.push(update);
			}

			return {
				id: r.id,
				children: r.children.map(child => buildTree(child)),
			};
		};

		const tree = buildTree(root);

		// Update local state to current frame
		this.lastRegions = currentRegionsMap;
		this.lastNodeIdToElement = nodeIdToElement;

		const cursorChanged =
			cursorPosition !== this.lastCursorPosition &&
			(!cursorPosition ||
				!this.lastCursorPosition ||
				cursorPosition.row !== this.lastCursorPosition.row ||
				cursorPosition.col !== this.lastCursorPosition.col);

		this.lastCursorPosition = cursorPosition;

		if (updates.length > 0 || cursorChanged || this.optionsChanged) {
			this.optionsChanged = false;
			this.sendEdits(tree, updates, cursorPosition);
			return true;
		}

		return false;
	}

	async render() {
		if (this.workerInstance) {
			await this.workerInstance.render();
		} else if (this.worker?.connected) {
			try {
				this.worker.send({
					type: 'render',
				});
			} catch (error) {
				console.error('Failed to send render message to worker:', error);
			}
		}
	}

	async fullRender() {
		if (this.workerInstance) {
			await this.workerInstance.fullRender();
		} else if (this.worker?.connected) {
			try {
				this.worker.send({
					type: 'fullRender',
				});
			} catch (error) {
				console.error('Failed to send fullRender message to worker:', error);
			}
		}
	}

	done() {
		if (this.workerInstance) {
			this.workerInstance.done();
		} else if (this.worker?.connected) {
			try {
				this.worker.send({
					type: 'done',
				});
			} catch {
				// Silently fail on exit errors as the worker might already be gone
			}
		}
	}

	async getLinesUpdated(): Promise<number> {
		if (this.workerInstance) {
			return this.workerInstance.getLinesUpdated();
		}

		if (!this.worker?.connected) {
			return 0;
		}

		return new Promise(resolve => {
			const handler = (message: any) => {
				if (message.type === 'linesUpdated') {
					this.worker?.off('message', handler);
					resolve(message.count as number);
				}
			};

			this.worker?.on('message', handler);

			try {
				this.worker?.send({type: 'getLinesUpdated'});
			} catch (error) {
				this.worker?.off('message', handler);
				console.error(
					'Failed to send getLinesUpdated message to worker:',
					error,
				);
				resolve(0);
			}
		});
	}

	resetLinesUpdated() {
		if (this.workerInstance) {
			this.workerInstance.resetLinesUpdated();
		} else if (this.worker?.connected) {
			try {
				this.worker.send({type: 'resetLinesUpdated'});
			} catch (error) {
				console.error(
					'Failed to send resetLinesUpdated message to worker:',
					error,
				);
			}
		}
	}

	destroy() {
		if (this.worker) {
			this.worker.kill();
		}

		if (this.resizeListener) {
			process.stdout.off('resize', this.resizeListener);
		}
	}

	private diffRegion(current: Region, nodeIdToElement: Map<number, DOMElement>): RegionUpdate | undefined {
		const last = this.lastRegions.get(current.id);
		const update: RegionUpdate = {id: current.id};
		let hasChanges = false;

		if (!last) {
			// New region, send everything
			hasChanges = true;
			update.x = current.x;
			update.y = current.y;
			update.width = current.width;
			update.height = current.height;
			update.scrollTop = current.scrollTop;
			update.scrollLeft = current.scrollLeft;
			update.scrollHeight = current.scrollHeight;
			update.scrollWidth = current.scrollWidth;
			update.isScrollable = current.isScrollable;
			update.isVerticallyScrollable = current.isVerticallyScrollable;
			update.isHorizontallyScrollable = current.isHorizontallyScrollable;
			update.scrollbarVisible = current.scrollbarVisible;
			update.overflowToBackbuffer = current.overflowToBackbuffer;
			update.marginRight = current.marginRight;
			update.marginBottom = current.marginBottom;
			update.scrollbarThumbColor = current.scrollbarThumbColor;
			update.stickyHeaders = current.stickyHeaders;

			// Send all lines
			const serialized = this.serializer.serialize(current.lines);
			update.lines = {
				updates: [
					{
						start: 0,
						end: current.lines.length,
						data: serialized,
					},
				],
				totalLength: current.lines.length,
			};

			return update;
		}

		// Check properties
		if (current.x !== last.x) {
			update.x = current.x;
			hasChanges = true;
		}

		if (current.y !== last.y) {
			update.y = current.y;
			hasChanges = true;
		}

		if (current.width !== last.width) {
			update.width = current.width;
			hasChanges = true;
		}

		if (current.height !== last.height) {
			update.height = current.height;
			hasChanges = true;
		}

		if (current.scrollTop !== last.scrollTop) {
			update.scrollTop = current.scrollTop;
			hasChanges = true;
		}

		if (current.scrollLeft !== last.scrollLeft) {
			update.scrollLeft = current.scrollLeft;
			hasChanges = true;
		}

		if (current.scrollHeight !== last.scrollHeight) {
			update.scrollHeight = current.scrollHeight;
			hasChanges = true;
		}

		if (current.scrollWidth !== last.scrollWidth) {
			update.scrollWidth = current.scrollWidth;
			hasChanges = true;
		}

		if (current.isScrollable !== last.isScrollable) {
			update.isScrollable = current.isScrollable;
			hasChanges = true;
		}

		if (current.isVerticallyScrollable !== last.isVerticallyScrollable) {
			update.isVerticallyScrollable = current.isVerticallyScrollable;
			hasChanges = true;
		}

		if (current.isHorizontallyScrollable !== last.isHorizontallyScrollable) {
			update.isHorizontallyScrollable = current.isHorizontallyScrollable;
			hasChanges = true;
		}

		if (current.scrollbarVisible !== last.scrollbarVisible) {
			update.scrollbarVisible = current.scrollbarVisible;
			hasChanges = true;
		}

		if (current.overflowToBackbuffer !== last.overflowToBackbuffer) {
			update.overflowToBackbuffer = current.overflowToBackbuffer;
			hasChanges = true;
		}

		if (current.marginRight !== last.marginRight) {
			update.marginRight = current.marginRight;
			hasChanges = true;
		}

		if (current.marginBottom !== last.marginBottom) {
			update.marginBottom = current.marginBottom;
			hasChanges = true;
		}

		if (current.scrollbarThumbColor !== last.scrollbarThumbColor) {
			update.scrollbarThumbColor = current.scrollbarThumbColor;
			hasChanges = true;
		}

		// Deep compare sticky headers? For now assuming reference change or simple length change is enough,
		// or we can rely on the fact they are rebuilt every frame.
		// Let's just resend if length differs or assume they might change.
		// To be safe and simple: always send sticky headers if they exist or existed.
		if (current.stickyHeaders !== last.stickyHeaders || current.stickyHeaders.length > 0 || last.stickyHeaders.length > 0) {
			update.stickyHeaders = current.stickyHeaders;
			hasChanges = true;
		}

		// Diff lines
		const lineUpdates = this.diffLines(last.lines, current.lines);

		if (lineUpdates.length > 0 || last.lines.length !== current.lines.length) {
			hasChanges = true;
			update.lines = {
				updates: lineUpdates,
				totalLength: current.lines.length,
			};

			if (current.stableScrollback && current.nodeId !== undefined) {
				const element = nodeIdToElement.get(current.nodeId);
				if (element) {
					const scrollTop = current.scrollTop ?? 0;
					for (const chunk of lineUpdates) {
						if (chunk.start < scrollTop) {
							element.internalIsScrollbackDirty = true;
							break;
						}
					}

					// Also check if lines were removed from the end of the content but still within the scrollback
					if (
						!element.internalIsScrollbackDirty &&
						current.lines.length < last.lines.length &&
						current.lines.length < scrollTop
					) {
						element.internalIsScrollbackDirty = true;
					}
				}
			}
		}

		return hasChanges ? update : undefined;
	}

	private diffLines(
		oldLines: StyledChar[][],
		newLines: StyledChar[][],
	): Array<{
		start: number;
		end: number;
		data: Uint8Array;
		source?: Uint8Array;
	}> {
		const updates: Array<{
			start: number;
			end: number;
			data: Uint8Array;
			source?: Uint8Array;
		}> = [];

		const limit = Math.max(oldLines.length, newLines.length);
		let chunkStart = -1;
		let chunkLines: StyledChar[][] = [];
		let chunkSource: StyledChar[][] = [];

		for (let i = 0; i < limit; i++) {
			const newLine = newLines[i];
			const oldLine = oldLines[i];

			const areEqual = this.linesEqual(oldLine, newLine);

			if (areEqual) {
				if (chunkStart !== -1) {
					updates.push({
						start: chunkStart,
						end: chunkStart + chunkLines.length,
						data: this.serializer.serialize(chunkLines),
						source: debugEdits
							? this.serializer.serialize(chunkSource)
							: undefined,
					});
					chunkStart = -1;
					chunkLines = [];
					chunkSource = [];
				}
			} else {
				if (chunkStart === -1) {
					chunkStart = i;
				}

				chunkLines.push(newLine ?? []);

				if (debugEdits) {
					chunkSource.push(oldLine ?? []);
				}
			}
		}

		if (chunkStart !== -1) {
			updates.push({
				start: chunkStart,
				end: chunkStart + chunkLines.length,
				data: this.serializer.serialize(chunkLines),
				source: debugEdits ? this.serializer.serialize(chunkSource) : undefined,
			});
		}

		return updates;
	}

	private sendEdits(
		tree: RegionNode,
		updates: RegionUpdate[],
		cursorPosition?: {row: number; col: number},
	) {
		if (this.workerInstance) {
			this.workerInstance.update(tree, updates, cursorPosition);
		} else if (this.worker?.connected) {
			try {
				this.worker.send({
					type: 'edits',
					tree,
					updates,
					cursorPosition,
				});
			} catch (error) {
				console.error('Failed to send edits to worker:', error);
			}
		}
	}

	private linesEqual(
		lineA: StyledChar[] | undefined,
		lineB: StyledChar[] | undefined,
	): boolean {
		if (lineA === lineB) {
			return true;
		}

		if (!lineA || !lineB) {
			return false;
		}

		if (lineA.length !== lineB.length) {
			return false;
		}

		for (const [i, charA] of lineA.entries()) {
			const charB = lineB[i];

			if (
				charA.value !== charB!.value ||
				charA.fullWidth !== charB!.fullWidth
			) {
				return false;
			}

			if (charA.styles.length !== charB!.styles.length) {
				return false;
			}

			for (const [j, styleA] of charA.styles.entries()) {
				const styleB = charB!.styles[j];

				if (
					styleA.code !== styleB!.code ||
					styleA.endCode !== styleB!.endCode
				) {
					return false;
				}
			}
		}

		return true;
	}
}
