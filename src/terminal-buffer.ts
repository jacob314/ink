/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fork, type ChildProcess} from 'node:child_process';
import {StyledLine} from './styled-line.js';
import {Serializer} from './serialization.js';
import {TerminalBufferWorker} from './worker/render-worker.js';
import {linesEqual} from './worker/terminal-writer.js';
import {type DOMElement} from './dom.js';
import {
	type Region,
	type RegionUpdate,
	type RegionNode,
	flattenRegion,
	regionLayoutProperties,
	copyRegionProperty,
	treesEqual,
} from './output.js';
import {type InkOptions} from './components/AppContext.js';

const debugEdits = false;
const emptyStyledLine = new StyledLine();

export default class TerminalBuffer {
	public get lines(): StyledLine[] {
		if (this._cachedLines) {
			return this._cachedLines;
		}

		if (this.lastRootRegion) {
			this._cachedLines = flattenRegion(this.lastRootRegion, {
				skipScrollbars: true,
				skipStickyHeaders: true,
			});
			return this._cachedLines;
		}

		return [];
	}

	private _cachedLines?: StyledLine[];
	private lastRootRegion?: Region;
	private readonly serializer = new Serializer();
	private readonly worker?: ChildProcess;
	private readonly workerInstance?: TerminalBufferWorker;
	private readonly resizeListener?: () => void;
	private readonly stdout: NodeJS.WriteStream;

	// Track previous state of all regions by ID
	private lastRegions = new Map<string | number, Region>();
	private lastCursorPosition?: {row: number; col: number};
	private lastTree?: RegionNode;

	private lastOptions?: InkOptions;
	private optionsChanged = false;

	private columns: number;
	private rows: number;

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
			forceScrollToBottomOnBackbufferRefresh?: boolean;
			cacheToStyledCharacters?: boolean;
		},
	) {
		this.lastOptions = {
			isAlternateBufferEnabled: options?.isAlternateBufferEnabled,
			stickyHeadersInBackbuffer: options?.stickyHeadersInBackbuffer,
			animatedScroll: options?.animatedScroll,
			animationInterval: options?.animationInterval,
			backbufferUpdateDelay: options?.backbufferUpdateDelay,
			maxScrollbackLength: options?.maxScrollbackLength,
			forceScrollToBottomOnBackbufferRefresh:
				options?.forceScrollToBottomOnBackbufferRefresh,
		};
		this.columns = columns;
		this.rows = rows;

		this.stdout = options?.stdout ?? process.stdout;

		const createWorkerInstance = () => {
			const instance = new TerminalBufferWorker(columns, rows, {
				debugRainbowEnabled: options?.debugRainbowEnabled,
				stdout: this.stdout,
				isAlternateBufferEnabled: options?.isAlternateBufferEnabled,
				stickyHeadersInBackbuffer: options?.stickyHeadersInBackbuffer,
				animatedScroll: options?.animatedScroll,
				animationInterval: options?.animationInterval,
				backbufferUpdateDelay: options?.backbufferUpdateDelay,
				maxScrollbackLength: options?.maxScrollbackLength,
				forceScrollToBottomOnBackbufferRefresh:
					options?.forceScrollToBottomOnBackbufferRefresh,
			});
			void instance.render();
			return instance;
		};

		let renderInProcess = options?.renderInProcess ?? false;
		let workerUrl: URL | undefined;

		if (!renderInProcess) {
			// eslint-disable-next-line unicorn/relative-url-style
			workerUrl = new URL('./worker/worker-entry.js', import.meta.url);
			let workerPath =
				workerUrl.protocol === 'file:' ? fileURLToPath(workerUrl) : null;

			// Fallback for ts-node testing environments
			if (
				workerPath &&
				!fs.existsSync(workerPath) &&
				workerPath.endsWith('.js')
			) {
				const tsPath = workerPath.replace(/\.js$/, '.ts');
				if (fs.existsSync(tsPath)) {
					workerPath = tsPath;
					// eslint-disable-next-line unicorn/relative-url-style
					workerUrl = new URL('./worker/worker-entry.ts', import.meta.url);
				}
			}

			if (workerPath && !fs.existsSync(workerPath)) {
				console.warn(`Unable to launch render process at ${workerPath}`);
				// Fallback to in-process rendering if the worker file was not bundled.
				renderInProcess = true;
			}
		}

		if (renderInProcess) {
			this.workerInstance = createWorkerInstance();
		} else {
			this.worker = fork(workerUrl!, {
				env: {
					...process.env,

					INK_WORKER: 'true',
				},
			});

			this.worker.on('error', error => {
				console.error('Render worker error:', error);
			});

			this.sendToWorker(
				{
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
					forceScrollToBottomOnBackbufferRefresh:
						options?.forceScrollToBottomOnBackbufferRefresh,
					cacheToStyledCharacters: options?.cacheToStyledCharacters,
				},
				'Failed to send init message to worker:',
			);
		}

		this.resizeListener = () => {
			if (this.stdout.columns && this.stdout.rows) {
				this.resize(this.stdout.columns, this.stdout.rows);
			}
		};

		this.stdout.on('resize', this.resizeListener);
	}

	resize(columns: number, rows: number) {
		if (this.columns === columns && this.rows === rows) {
			return;
		}

		this.columns = columns;
		this.rows = rows;

		if (this.workerInstance) {
			this.workerInstance.resize(columns, rows);
		} else {
			this.sendToWorker(
				{
					type: 'resize',
					columns,
					rows,
				},
				'Failed to send resize message to worker:',
			);
		}
	}

	updateOptions(options: InkOptions) {
		const keys: Array<keyof InkOptions> = [
			'isAlternateBufferEnabled',
			'stickyHeadersInBackbuffer',
			'animatedScroll',
			'animationInterval',
			'backbufferUpdateDelay',
			'maxScrollbackLength',
			'forceScrollToBottomOnBackbufferRefresh',
		];

		for (const key of keys) {
			if (options[key] !== this.lastOptions?.[key]) {
				this.optionsChanged = true;
				break;
			}
		}

		this.lastOptions = {...options};

		if (this.workerInstance) {
			this.workerInstance.updateOptions(options);
		} else {
			this.sendToWorker(
				{
					type: 'updateOptions',
					options,
				},
				'Failed to send updateOptions message to worker:',
			);
		}
	}

	startRecording(filename: string) {
		if (this.workerInstance) {
			this.workerInstance.startRecording(filename);
		} else {
			this.sendToWorker(
				{
					type: 'startRecording',
					filename,
				},
				'Failed to send startRecording message to worker:',
			);
		}
	}

	stopRecording() {
		if (this.workerInstance) {
			this.workerInstance.stopRecording();
		} else {
			this.sendToWorker(
				{
					type: 'stopRecording',
				},
				'Failed to send stopRecording message to worker:',
			);
		}
	}

	dumpCurrentFrame(filename: string) {
		if (this.workerInstance) {
			this.workerInstance.dumpCurrentFrame(filename);
		} else {
			this.sendToWorker(
				{
					type: 'dumpCurrentFrame',
					filename,
				},
				'Failed to send dumpCurrentFrame message to worker:',
			);
		}
	}

	update(
		_start: number,
		_end: number,
		root: Region,
		cursorPosition?: {row: number; col: number},
	): boolean {
		this.lastRootRegion = root;
		this._cachedLines = undefined;
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

		const treeChanged = !this.lastTree || !treesEqual(this.lastTree, tree);
		this.lastTree = tree;

		// Update local state to current frame
		this.lastRegions = currentRegionsMap;

		const cursorChanged =
			cursorPosition !== this.lastCursorPosition &&
			(!cursorPosition ||
				!this.lastCursorPosition ||
				cursorPosition.row !== this.lastCursorPosition.row ||
				cursorPosition.col !== this.lastCursorPosition.col);

		this.lastCursorPosition = cursorPosition;

		if (
			updates.length > 0 ||
			cursorChanged ||
			this.optionsChanged ||
			treeChanged
		) {
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
			this.stdout.off('resize', this.resizeListener);
		}
	}

	private sendToWorker(message: any, errorMessage: string) {
		if (this.worker?.connected) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				this.worker.send(message);
			} catch (error) {
				console.error(errorMessage, error);
			}
		}
	}

	private diffRegion(
		current: Region,
		nodeIdToElement: Map<number, DOMElement>,
	): RegionUpdate | undefined {
		const last = this.lastRegions.get(current.id);
		const update: RegionUpdate = {id: current.id};
		let hasChanges = false;

		if (!last) {
			// New region, send everything
			hasChanges = true;
			for (const key of regionLayoutProperties) {
				copyRegionProperty(update, current, key);
			}

			update.stickyHeaders = current.stickyHeaders.map(h => ({
				...h,
				node: undefined,
				lines: this.serializer.serialize(h.lines),
				stuckLines: h.stuckLines
					? this.serializer.serialize(h.stuckLines)
					: undefined,
				styledOutput: this.serializer.serialize(h.styledOutput),
			}));

			// Send all lines
			const serialized = this.serializer.serialize(current.lines);
			const offsetY = current.linesOffsetY ?? 0;
			update.lines = {
				updates: [
					{
						start: offsetY,
						end: offsetY + current.lines.length,
						data: serialized,
					},
				],
				totalLength: current.lines.length,
			};

			return update;
		}

		const currentProto = Object.getPrototypeOf(current) as Region;
		const lastProto = Object.getPrototypeOf(last) as Region;

		// Optimization: Fast path for cached StaticRender regions.
		//
		// When Ink renders a cached static element, it does not deep clone the Region.
		// Instead, it uses `Object.create(cachedRegion)` to create a new object that
		// delegates property lookups to the shared cache (prototype), but allows
		// overriding the layout position (x, y, etc.) on the new instance itself.
		//
		// If `currentProto === lastProto`, it is mathematically guaranteed that EVERY
		// property delegated to the prototype (width, height, content lines, styles)
		// is 100% identical between the two frames.
		//
		// Therefore, if the prototypes match, we only need to verify that the specific
		// properties assigned directly to the instance (shadowed properties like x and y)
		// also match. If they do, the region hasn't changed at all, and we can safely
		// bypass the slow 22-property loop below.
		if (
			currentProto === lastProto &&
			currentProto !== Object.prototype &&
			current.x === last.x &&
			current.y === last.y &&
			current.overflowToBackbuffer === last.overflowToBackbuffer &&
			current.lines === last.lines &&
			current.linesOffsetY === last.linesOffsetY
		) {
			// Exact same cached region with no layout overrides; skip the 22-property dynamic loop entirely.
			return undefined;
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

		if (current.backgroundColor !== last.backgroundColor) {
			update.backgroundColor = current.backgroundColor;
			hasChanges = true;
		}

		if (current.opaque !== last.opaque) {
			update.opaque = current.opaque;
			hasChanges = true;
		}

		if (current.borderTop !== last.borderTop) {
			update.borderTop = current.borderTop;
			hasChanges = true;
		}

		if (current.borderBottom !== last.borderBottom) {
			update.borderBottom = current.borderBottom;
			hasChanges = true;
		}

		if (current.linesOffsetY !== last.linesOffsetY) {
			update.linesOffsetY = current.linesOffsetY;
			hasChanges = true;
		}

		// Deep compare sticky headers? For now assuming reference change or simple length change is enough,
		// or we can rely on the fact they are rebuilt every frame.
		// Let's just resend if length differs or assume they might change.
		// To be safe and simple: always send sticky headers if they exist or existed.
		if (current.stickyHeaders.length > 0 || last.stickyHeaders.length > 0) {
			update.stickyHeaders = current.stickyHeaders.map(h => ({
				...h,
				node: undefined,
				lines: this.serializer.serialize(h.lines),
				stuckLines: h.stuckLines
					? this.serializer.serialize(h.stuckLines)
					: undefined,
				styledOutput: this.serializer.serialize(h.styledOutput),
			}));
			hasChanges = true;
		}

		// Diff lines
		const lineUpdates = this.diffLines(
			last.lines,
			last.linesOffsetY ?? 0,
			current.lines,
			current.linesOffsetY ?? 0,
		);

		if (
			lineUpdates.length > 0 ||
			last.lines.length !== current.lines.length ||
			last.linesOffsetY !== current.linesOffsetY
		) {
			hasChanges = true;
			update.linesOffsetY = current.linesOffsetY;
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
					const oldEnd = (last.linesOffsetY ?? 0) + last.lines.length;
					const newEnd = (current.linesOffsetY ?? 0) + current.lines.length;
					if (
						!element.internalIsScrollbackDirty &&
						newEnd < oldEnd &&
						newEnd < scrollTop
					) {
						element.internalIsScrollbackDirty = true;
					}
				}
			}
		}

		return hasChanges ? update : undefined;
	}

	private diffLines(
		oldLines: readonly StyledLine[],
		oldOffsetY: number,
		newLines: readonly StyledLine[],
		newOffsetY: number,
	): Array<{
		start: number;
		end: number;
		data: Uint8Array;
		source?: Uint8Array;
	}> {
		if (oldLines === newLines && oldOffsetY === newOffsetY) {
			return [];
		}

		const updates: Array<{
			start: number;
			end: number;
			data: Uint8Array;
			source?: Uint8Array;
		}> = [];

		const minOffset = Math.min(oldOffsetY, newOffsetY);
		const maxOld = oldOffsetY + oldLines.length;
		const maxNew = newOffsetY + newLines.length;
		const maxOffset = Math.max(maxOld, maxNew);

		let chunkStart = -1;
		let chunkLines: StyledLine[] = [];
		let chunkSource: StyledLine[] = [];

		const flushChunk = () => {
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
		};

		for (let y = minOffset; y < maxOffset; y++) {
			const oldLine =
				y >= oldOffsetY && y < maxOld ? oldLines[y - oldOffsetY] : undefined;
			const newLine =
				y >= newOffsetY && y < maxNew ? newLines[y - newOffsetY] : undefined;

			const areEqual = linesEqual(oldLine, newLine);
			if (areEqual) {
				flushChunk();
			} else {
				// Skip leading empty lines for the chunk to save memory/IPC if they don't need to overwrite old content
				const isNewLineEmpty = !newLine || newLine.length === 0;
				const isOldLineEmpty = !oldLine || oldLine.length === 0;
				if (chunkStart === -1 && isNewLineEmpty && isOldLineEmpty) {
					continue;
				}

				if (chunkStart === -1) {
					chunkStart = y;
				}

				// If newLine is undefined but oldLine is not, we still need to send an empty line to clear it.
				// However, if newLine is genuinely undefined and we're pushing it into chunkLines,
				// the serializer handles undefined elements by treating them as empty. Let's cast to
				// any to bypass TS error or use a shared empty StyledLine.
				// For now, since chunkLines is StyledLine[], we can push an empty one if we don't have it.
				// Actually, we can push newLine as it is if we allow undefined in the type, but since
				// it's defined as StyledLine[], we'll use a shared empty instance to avoid allocating.
				chunkLines.push(newLine ?? emptyStyledLine);

				if (debugEdits) {
					chunkSource.push(oldLine ?? emptyStyledLine);
				}
			}
		}

		flushChunk();

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
}
