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
import {type DOMElement, type StickyHeader} from './dom.js';
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

		for (const key of regionLayoutProperties) {
			if (current[key] !== last[key]) {
				copyRegionProperty(update, current, key);
				hasChanges = true;
			}
		}

		if (!this.stickyHeadersEqual(last.stickyHeaders, current.stickyHeaders)) {
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
		const lineUpdatesResult = this.diffLines(
			last.lines,
			current.lines,
		);
		const lineUpdates = lineUpdatesResult.updates;

		if (lineUpdates.length > 0 || last.lines.length !== current.lines.length) {
			hasChanges = true;
			update.lines = {
				updates: lineUpdates,
				totalLength: current.lines.length,
				contentShiftDelta: lineUpdatesResult.contentShiftDelta,
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

	private stickyHeadersEqual(
		oldHeaders: StickyHeader[],
		newHeaders: StickyHeader[],
	): boolean {
		if (oldHeaders.length !== newHeaders.length) {
			return false;
		}

		for (let i = 0; i < oldHeaders.length; i++) {
			const oldH = oldHeaders[i]!;
			const newH = newHeaders[i]!;

			if (
				oldH.x !== newH.x ||
				oldH.y !== newH.y ||
				oldH.naturalRow !== newH.naturalRow ||
				oldH.startRow !== newH.startRow ||
				oldH.endRow !== newH.endRow ||
				oldH.scrollContainerId !== newH.scrollContainerId ||
				oldH.nodeId !== newH.nodeId
			) {
				return false;
			}

			if (oldH.lines.length !== newH.lines.length) return false;
			for (let j = 0; j < oldH.lines.length; j++) {
				if (!linesEqual(oldH.lines[j], newH.lines[j])) return false;
			}

			if (oldH.stuckLines && newH.stuckLines) {
				if (oldH.stuckLines.length !== newH.stuckLines.length) return false;
				for (let j = 0; j < oldH.stuckLines.length; j++) {
					if (!linesEqual(oldH.stuckLines[j], newH.stuckLines[j])) return false;
				}
			} else if (oldH.stuckLines !== newH.stuckLines) {
				return false;
			}

			if (oldH.styledOutput.length !== newH.styledOutput.length) return false;
			for (let j = 0; j < oldH.styledOutput.length; j++) {
				if (!linesEqual(oldH.styledOutput[j], newH.styledOutput[j]))
					return false;
			}
		}

		return true;
	}

	private diffLines(
		oldLines: readonly StyledLine[],
		newLines: readonly StyledLine[],
	): {
		updates: Array<{
			start: number;
			end: number;
			data: Uint8Array;
			source?: Uint8Array;
		}>;
		contentShiftDelta?: number;
	} {
		if (oldLines === newLines) {
			return {updates: []};
		}

		let contentShiftDelta = 0;

		// Check if content was prepended (or appended and shifted) by looking for 
		// exactly matching content at the very bottom of both buffers.
		if (newLines.length > oldLines.length && oldLines.length > 0) {
			const delta = newLines.length - oldLines.length;
			let matchingFromBottom = 0;
			
			for (let i = 1; i <= oldLines.length; i++) {
				if (linesEqual(oldLines[oldLines.length - i], newLines[newLines.length - i])) {
					matchingFromBottom++;
				} else {
					break;
				}
			}

			// If a significant portion matches from the bottom, we consider it a shift
			if (matchingFromBottom > 0) {
				contentShiftDelta = delta;
			}
		}

		const updates: Array<{
			start: number;
			end: number;
			data: Uint8Array;
			source?: Uint8Array;
		}> = [];

		const limit = Math.max(oldLines.length, newLines.length);
		let chunkStart = -1;
		let chunkLines: StyledLine[] = [];
		let chunkSource: StyledLine[] = [];
		
		for (let i = 0; i < limit; i++) {
			const newLine = newLines[i];
			
			// Adjust oldIndex by contentShiftDelta to compare correct lines
			const oldIndex = i - contentShiftDelta;
			const oldLine = oldIndex >= 0 && oldIndex < oldLines.length ? oldLines[oldIndex] : undefined;

			const areEqual = linesEqual(oldLine, newLine);
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

				chunkLines.push(newLine ?? StyledLine.empty(this.columns));

				if (debugEdits) {
					chunkSource.push(oldLine ?? StyledLine.empty(this.columns));
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

		return {
			updates,
			contentShiftDelta: contentShiftDelta !== 0 ? contentShiftDelta : undefined
		};
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
