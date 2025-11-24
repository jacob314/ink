import process from 'node:process';
import ansiEscapes from 'ansi-escapes';
import {debugLog} from '../debug-log.js';
import {type RegionNode, type RegionUpdate, type Region} from '../output.js';
import {type InkOptions} from '../components/AppContext.js';
import {
	type RenderLine,
	TerminalWriter,
	rainbowColors,
} from './terminal-writer.js';
import {Canvas} from './canvas.js';
import {SceneManager} from './scene-manager.js';
import {AnimationController} from './animation-controller.js';
import {Compositor} from './compositor.js';
import {ScrollOptimizer} from './scroll-optimizer.js';

const animationInterval = 4;

/**
 * Core renderer that composes together scrollable blocks of styled content.
 */
export class TerminalBufferWorker {
	frameIndex = 0;
	debugRainbowEnabled = false;
	isAlternateBufferEnabled = false;
	stickyHeadersInBackbuffer = false;
	animatedScroll = false;
	updatesReceived = 0;
	resized = false;
	cursorPosition?: {row: number; col: number};
	forceNextRender = false;

	// Ground truth on what lines should be rendered (composed frame)
	screen: RenderLine[] = [];
	backbuffer: RenderLine[] = [];

	private readonly sceneManager = new SceneManager();
	private readonly animationController: AnimationController;
		private readonly scrollOptimizer = new ScrollOptimizer();
	
		private readonly primaryTerminalWriter: TerminalWriter;
	
	private readonly alternateTerminalWriter: TerminalWriter;

	private get terminalWriter(): TerminalWriter {
		return this.isAlternateBufferEnabled
			? this.alternateTerminalWriter
			: this.primaryTerminalWriter;
	}

	get backbufferDirty(): boolean {
		return this.terminalWriter.backbufferDirty;
	}

	set backbufferDirty(value: boolean) {
		this.terminalWriter.backbufferDirty = value;
	}

	get backbufferDirtyCurrentFrame(): boolean {
		return this.terminalWriter.backbufferDirtyCurrentFrame;
	}

	set backbufferDirtyCurrentFrame(value: boolean) {
		this.terminalWriter.backbufferDirtyCurrentFrame = value;
	}

	constructor(
		public columns: number,
		public rows: number,
		options?: {
			debugRainbowEnabled?: boolean;
			stdout?: NodeJS.WriteStream;
			isAlternateBufferEnabled?: boolean;
			stickyHeadersInBackbuffer?: boolean;
			animatedScroll?: boolean;
		},
	) {
		const stdout = options?.stdout ?? process.stdout;
		this.primaryTerminalWriter = new TerminalWriter(columns, rows, stdout);
		this.alternateTerminalWriter = new TerminalWriter(columns, rows, stdout);

		this.primaryTerminalWriter.writeRaw(ansiEscapes.cursorHide);
		this.alternateTerminalWriter.writeRaw(ansiEscapes.cursorHide);

		if (options?.debugRainbowEnabled) {
			this.debugRainbowEnabled = true;
		}

		if (options?.isAlternateBufferEnabled) {
			this.isAlternateBufferEnabled = true;
		}

		if (options?.stickyHeadersInBackbuffer) {
			this.stickyHeadersInBackbuffer = true;
		}

		if (options?.animatedScroll) {
			this.animatedScroll = true;
		}

		if (this.isAlternateBufferEnabled) {
			this.alternateTerminalWriter.writeRaw(ansiEscapes.enterAlternativeScreen);
		}

		this.animationController = new AnimationController({
			interval: animationInterval,
			onTick: () => {
				this.tickAnimation();
			},
		});
	}
	updateOptions(options: InkOptions) {
		if (
			options.isAlternateBufferEnabled !== undefined &&
			this.isAlternateBufferEnabled !== options.isAlternateBufferEnabled
		) {
			// Flush current writer before switching
			this.terminalWriter.flush();

			if (this.terminalWriter.fullRenderTimeout) {
				clearTimeout(this.terminalWriter.fullRenderTimeout);
				this.terminalWriter.fullRenderTimeout = undefined;
			}

			if (options.isAlternateBufferEnabled) {
				this.primaryTerminalWriter.stdout.write(
					ansiEscapes.enterAlternativeScreen,
				);
				this.isAlternateBufferEnabled = true;

				// The newly active alternate buffer is effectively blank
				this.terminalWriter.clear();
			} else {
				this.alternateTerminalWriter.stdout.write(
					ansiEscapes.exitAlternativeScreen,
				);
				this.isAlternateBufferEnabled = false;

				// When returning to the primary buffer, we don't clear it (to preserve history/static output)
				// but we mark it as potentially having an unknown cursor position and tainted lines.
				this.terminalWriter.unkownCursorLocation();
				this.terminalWriter.taintScreen();
				this.terminalWriter.isTainted = true;
			}

			this.forceNextRender = true;
		}

		if (
			options.stickyHeadersInBackbuffer !== undefined &&
			this.stickyHeadersInBackbuffer !== options.stickyHeadersInBackbuffer
		) {
			this.stickyHeadersInBackbuffer = options.stickyHeadersInBackbuffer;
			this.forceNextRender = true;
		}

		if (
			options.animatedScroll !== undefined &&
			this.animatedScroll !== options.animatedScroll
		) {
			this.animatedScroll = options.animatedScroll;
			if (this.animatedScroll) {
				this.animationController.start();
			} else {
				this.animationController.stop();
			}
		}
	}

	update(
		tree: RegionNode,
		updates: RegionUpdate[],
		cursorPosition?: {row: number; col: number},
	): boolean {
		const previousCursorPosition = this.cursorPosition;
		this.cursorPosition = cursorPosition;

		this.updatesReceived++;

		if (this.animatedScroll) {
			if (this.updatesReceived > 2 && updates.length > 0) {
				debugLog(
					`[RENDER-WORKER] Interrupting animation for jump at update #${this.updatesReceived}\n`,
				);
				this.animationController.jumpToTargets(this.sceneManager.regions);
			}

			this.animationController.start();
		}

		this.sceneManager.update(tree, updates, {
			animatedScroll: this.animatedScroll,
			onScrollUpdate: (id, scrollTop) => {
				if (this.animatedScroll) {
					this.animationController.setTargetScrollTop(id, scrollTop);
				} else {
					const region = this.sceneManager.getRegion(id);
					if (region) {
						region.scrollTop = scrollTop;
					}
				}
			},
		});

		// Track regionWasAtEnd for scrollbars
		for (const update of updates) {
			const region = this.sceneManager.getRegion(update.id);
			if (region) {
				const currentEffectiveScrollTop =
					this.animationController.getTargetScrollTop(region.id) ??
					region.scrollTop ??
					0;
				const wasAtEnd =
					currentEffectiveScrollTop >=
					(region.scrollHeight ?? 0) - (region.height ?? 0);
				this.sceneManager.regionWasAtEnd.set(region.id, wasAtEnd);
			}
		}

		// Check backbuffer dirty
		const rootRegion = this.sceneManager.getRootRegion();
		if (rootRegion) {
			const cameraY = Math.max(0, rootRegion.height - this.rows);
			for (const update of updates) {
				const region = this.sceneManager.getRegion(update.id);

				if (region && update.lines) {
					for (const chunk of update.lines.updates) {
						const absStart = region.y + chunk.start;

						if (absStart < cameraY) {
							this.terminalWriter.backbufferDirty = true;
							this.terminalWriter.backbufferDirtyCurrentFrame = true;
						}
					}
				}
			}
		}

		const cursorChanged =
			cursorPosition !== previousCursorPosition &&
			(!cursorPosition ||
				!previousCursorPosition ||
				cursorPosition.row !== previousCursorPosition.row ||
				cursorPosition.col !== previousCursorPosition.col);

		const shouldRender =
			updates.length > 0 ||
			cursorChanged ||
			this.terminalWriter.backbufferDirty ||
			this.forceNextRender;

		return shouldRender;
	}

	resize(columns: number, rows: number) {
		if (this.columns === columns && this.rows === rows) {
			return;
		}

		this.columns = columns;
		this.rows = rows;

		debugLog(`XXXXX [RENDER-WORKER] Resize to ${columns}x${rows}\n`);
		this.primaryTerminalWriter.resize(columns, rows);
		this.alternateTerminalWriter.resize(columns, rows);
		this.terminalWriter.backbufferDirtyCurrentFrame = true;
		this.resized = true;
		void this.render();
	}

	async fullRender() {
		if (this.terminalWriter.fullRenderTimeout) {
			clearTimeout(this.terminalWriter.fullRenderTimeout);
			this.terminalWriter.fullRenderTimeout = undefined;
		}

		if (!this.terminalWriter.backbufferDirty) {
			await this.render();
			return;
		}

		debugLog(`XXXXX [RENDER-WORKER] True full render triggered\n`);

		this.terminalWriter.backbufferDirty = false;
		this.terminalWriter.backbufferDirtyCurrentFrame = false;

		this.composeScene();

		const rootRegion = this.sceneManager.getRootRegion();
		const cameraY = rootRegion ? this.getCameraY(rootRegion) : 0;

		this.syncCursor(cameraY);

		this.terminalWriter.clear();

		this.terminalWriter.writeLines(this.screen);
		this.terminalWriter.setBackbuffer(this.backbuffer);

		this.updateTrackingMaps(rootRegion, cameraY);

		this.terminalWriter.finish();
		this.terminalWriter.flush();
		this.terminalWriter.validateLinesConsistent(this.screen);
	}

	async render() {
		const rootRegion = this.sceneManager.getRootRegion();
		if (!rootRegion) {
			return;
		}

		this.forceNextRender = false;

		if (this.debugRainbowEnabled) {
			this.frameIndex++;
			this.terminalWriter.debugRainbowColor =
				rainbowColors[this.frameIndex % rainbowColors.length];
		}

		const cameraY = this.getCameraY(rootRegion);
		this.syncCursor(cameraY);

		if (!this.terminalWriter.isFirstRender) {
			// 0. Handle Global Scroll (Backbuffer growth)
			const maxPushed =
				this.scrollOptimizer.maxRegionScrollTops.get(rootRegion.id) ?? 0;
			const linesToScroll = cameraY - maxPushed;

			if (linesToScroll > 0) {
				this.appendToBackbuffer(maxPushed, linesToScroll);
				this.scrollOptimizer.updateMaxPushed(rootRegion.id, cameraY);
			}

			// 0.5 Handle Local Region Scrolls
			const compositor = this.createCompositor({
				skipStickyHeaders: true,
				skipScrollbars: false,
			});

			for (const region of this.sceneManager.regions.values()) {
				const operations = this.scrollOptimizer.calculateScrollOperations(
					region,
					this.rows,
					this.columns,
					cameraY,
					(scrollStart, count) => {
						const originalScrollTop = region.scrollTop;
						region.scrollTop = scrollStart;
						try {
							const canvas = Canvas.create(this.columns, this.rows + count);
							this.composeNode(
								this.sceneManager.root!,
								canvas,
								{clip: undefined, offsetY: -cameraY},
								{skipStickyHeaders: true, skipScrollbars: false},
							);

							const absY = Math.round(region.y - cameraY);
							const start = Math.max(0, absY);
							const regionHeight = Math.round(region.height);
							const actualStuckTopHeight =
								compositor.calculateActualStuckTopHeight(
									region,
									absY,
									scrollStart,
								);
							const adjustedStart = Math.round(
								Math.max(start, absY + actualStuckTopHeight),
							);

							return canvas
								.getLines()
								.slice(
									adjustedStart,
									adjustedStart +
										Math.min(this.rows, absY + regionHeight) -
										adjustedStart +
										count,
								);
						} finally {
							region.scrollTop = originalScrollTop;
						}
					},
					(r, y, s) => compositor.calculateActualStuckTopHeight(r, y, s),
					(r, y, s) => compositor.calculateActualStuckBottomHeight(r, y, s),
				);

				for (const op of operations) {
					this.terminalWriter.scrollLines(op);
					if (op.newMaxPushed !== undefined) {
						this.scrollOptimizer.updateMaxPushed(op.regionId, op.newMaxPushed);
					}
				}
			}
		}

		// 2. Compose Frame
		this.composeScene();

		if (this.terminalWriter.isFirstRender) {
			this.terminalWriter.writeLines([...this.backbuffer, ...this.screen]);
		} else {
			// 3. Sync
			for (let row = 0; row < this.rows; row++) {
				this.terminalWriter.syncLine(this.screen[row]!, row);
			}
		}

		this.terminalWriter.finish();
		this.terminalWriter.flush();

		this.updateTrackingMaps(rootRegion, cameraY);

		if (this.terminalWriter.backbufferDirtyCurrentFrame) {
			this.terminalWriter.backbufferDirty = true;

			if (this.terminalWriter.fullRenderTimeout) {
				clearTimeout(this.terminalWriter.fullRenderTimeout);
			}

			this.terminalWriter.fullRenderTimeout = setTimeout(() => {
				void this.fullRender();
			}, 1000);
		}

		this.terminalWriter.backbufferDirtyCurrentFrame = false;
	}

	done() {
		this.animationController.stop();
		this.terminalWriter.done();

		if (this.isAlternateBufferEnabled) {
			this.terminalWriter.stdout.write(ansiEscapes.exitAlternativeScreen);
		}

		this.terminalWriter.flush();
	}

	getLinesUpdated(): number {
		return this.terminalWriter.getLinesUpdated();
	}

	resetLinesUpdated() {
		this.terminalWriter.resetLinesUpdated();
	}

	private tickAnimation() {
		const {hasScrolled, canScrollMore} = this.animationController.updateRegions(
			this.sceneManager.regions,
		);

		if (hasScrolled) {
			void this.render();
		}

		if (!canScrollMore) {
			debugLog(`[RENDER-WORKER] Stopping animation: all targets reached\n`);
			this.animationController.stop();
		}
	}

	private composeScene() {
		const rootRegion = this.sceneManager.getRootRegion();
		if (!rootRegion) {
			return;
		}

		const cameraY = this.getCameraY(rootRegion);
		this.backbuffer = [];

		if (!this.isAlternateBufferEnabled) {
			const composeToBackbuffer = (
				node: RegionNode,
				region: Region,
				height: number,
				offset: number,
			) => {
				if (this.stickyHeadersInBackbuffer) {
					const canvas = Canvas.create(this.columns, height);
					this.composeNode(
						node,
						canvas,
						{clip: undefined, offsetY: -offset},
						{skipScrollbars: true},
					);
					for (const line of canvas.getLines()) {
						this.backbuffer.push(
							this.terminalWriter.clampLine(line.styledChars, this.columns),
						);
					}
				} else {
					for (let i = 0; i < height; i++) {
						const line = region.lines[i + offset] ?? [];
						this.backbuffer.push(
							this.terminalWriter.clampLine(line, this.columns),
						);
					}
				}
			};

			composeToBackbuffer(this.sceneManager.root!, rootRegion, cameraY, 0);

			for (const region of this.sceneManager.regions.values()) {
				if (region.overflowToBackbuffer && region.isScrollable) {
					const scrollTop = region.scrollTop ?? 0;
					const node = this.findNodeForRegion(region.id);
					if (node) {
						composeToBackbuffer(node, region, scrollTop, 0);
					}
				}
			}
		}

		const canvas = Canvas.create(this.columns, this.rows, this.resized);
		this.composeNode(this.sceneManager.root!, canvas, {
			clip: undefined,
			offsetY: -cameraY,
		});
		this.screen = canvas.getLines();
		this.resized = false;
	}

	private composeNode(
		node: RegionNode,
		canvas: Canvas,
		{
			clip,
			offsetY = 0,
			offsetX = 0,
		}: {
			clip?: {x: number; y: number; w: number; h: number};
			offsetY?: number;
			offsetX?: number;
		},
		options?: {skipStickyHeaders?: boolean; skipScrollbars?: boolean},
	) {
		const region = this.sceneManager.getRegion(node.id);
		if (!region) return;

		const absX = Math.round(region.x + offsetX);
		const absY = Math.round(region.y + offsetY);

		if (absY >= canvas.height) return;
		if (absY + region.height < 0 && !this.stickyHeadersInBackbuffer) return;

		let myClip = {
			x: absX,
			y: absY,
			w: Math.round(region.width),
			h: Math.round(region.height),
		};
		if (clip) {
			const x1 = Math.max(myClip.x, clip.x);
			const y1 = Math.max(myClip.y, clip.y);
			const x2 = Math.min(myClip.x + myClip.w, clip.x + clip.w);
			const y2 = Math.min(myClip.y + myClip.h, clip.y + clip.h);
			if (x2 <= x1 || y2 <= y1) return;
			myClip = {x: x1, y: y1, w: x2 - x1, h: y2 - y1};
		}

		const compositor = this.createCompositor(options);
		compositor.drawContent(canvas, region, absX, absY, myClip);

		for (const child of node.children) {
			this.composeNode(
				child,
				canvas,
				{
					clip: myClip,
					offsetY: absY - (region.scrollTop ?? 0),
					offsetX: absX - (region.scrollLeft ?? 0),
				},
				options,
			);
		}

		compositor.drawStickyHeaders(canvas, region, absX, absY, myClip);
		compositor.drawScrollbars(canvas, region, absX, absY, myClip);
	}

	private createCompositor(options?: {
		skipStickyHeaders?: boolean;
		skipScrollbars?: boolean;
	}): Compositor {
		return new Compositor({
			skipStickyHeaders: options?.skipStickyHeaders,
			skipScrollbars: options?.skipScrollbars,
			stickyHeadersInBackbuffer: this.stickyHeadersInBackbuffer,
			animatedScroll: this.animatedScroll,
			targetScrollTops: this.animationController.allTargetScrollTops,
			regionWasAtEnd: this.sceneManager.regionWasAtEnd,
		});
	}

	private getCameraY(rootRegion: Region): number {
		return Math.max(0, rootRegion.height - this.rows);
	}

	private syncCursor(cameraY: number) {
		let cursorRow = -1;
		let cursorCol = -1;

		if (this.cursorPosition) {
			const row = this.cursorPosition.row - cameraY;
			if (row >= 0 && row < this.rows) {
				cursorRow = row;
				cursorCol = this.cursorPosition.col;
			}
		}

		this.terminalWriter.setTargetCursorPosition(cursorRow, cursorCol);
	}

	private appendToBackbuffer(start: number, count: number) {
		const rootNode = this.sceneManager.root;
		if (!rootNode) return;

		const canvas = Canvas.create(this.columns, count);
		this.composeNode(
			rootNode,
			canvas,
			{clip: undefined, offsetY: -start},
			{
				skipStickyHeaders: !this.stickyHeadersInBackbuffer,
				skipScrollbars: true,
			},
		);

		const linesScrollingOut = canvas
			.getLines()
			.map(line =>
				this.terminalWriter.clampLine(line.styledChars, this.columns),
			);

		this.terminalWriter.appendLinesBackbuffer(linesScrollingOut);
	}

	private updateTrackingMaps(rootRegion: Region | undefined, cameraY: number) {
		if (rootRegion) {
			this.scrollOptimizer.updateMaxPushed(rootRegion.id, cameraY);
		}

		for (const region of this.sceneManager.regions.values()) {
			if (region.isScrollable) {
				this.scrollOptimizer.lastRegionScrollTops.set(
					region.id,
					region.scrollTop ?? 0,
				);

				if (region.overflowToBackbuffer) {
					this.scrollOptimizer.updateMaxPushed(
						region.id,
						region.scrollTop ?? 0,
					);
				}
			}
		}
	}

	private findNodeForRegion(id: string | number): RegionNode | undefined {
		if (!this.sceneManager.root) return undefined;

		const visit = (node: RegionNode): RegionNode | undefined => {
			if (node.id === id) return node;
			for (const child of node.children) {
				const found = visit(child);
				if (found) return found;
			}

			return undefined;
		};

		return visit(this.sceneManager.root);
	}
}
