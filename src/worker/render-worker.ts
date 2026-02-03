import process from 'node:process';
import {Buffer} from 'node:buffer';
import ansiEscapes from 'ansi-escapes';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {debugLog} from '../debug-log.js';
import {calculateScrollbarThumb} from '../measure-element.js';
import {type RegionNode, type RegionUpdate, type Region} from '../output.js';
import {Deserializer} from '../serialization.js';
import {renderScrollbar} from '../render-scrollbar.js';
import {type InkOptions} from '../components/AppContext.js';
import {
	type RenderLine,
	TerminalWriter,
	rainbowColors,
} from './terminal-writer.js';

export class TerminalBufferWorker {
	// Local state of regions
	regions = new Map<string | number, Region>();
	root?: RegionNode;

	frameIndex = 0;
	debugRainbowEnabled = false;
	isAlternateBufferEnabled = false;
	isBackbufferStickyHeadersEnabled = false;
	resized = false;
	cursorPosition?: {row: number; col: number};
	forceNextRender = false;

	// Ground truth on what lines should be rendered (composed frame)
	screen: RenderLine[] = [];
	backbuffer: RenderLine[] = [];

	private readonly primaryTerminalWriter: TerminalWriter;
	private readonly alternateTerminalWriter: TerminalWriter;

	private get terminalWriter(): TerminalWriter {
		return this.isAlternateBufferEnabled
			? this.alternateTerminalWriter
			: this.primaryTerminalWriter;
	}

	constructor(
		public columns: number,
		public rows: number,
		options?: {
			debugRainbowEnabled?: boolean;
			stdout?: NodeJS.WriteStream;
			isAlternateBufferEnabled?: boolean;
			isBackbufferStickyHeadersEnabled?: boolean;
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

		if (options?.isBackbufferStickyHeadersEnabled) {
			this.isBackbufferStickyHeadersEnabled = true;
		}

		if (this.isAlternateBufferEnabled) {
			this.alternateTerminalWriter.writeRaw(ansiEscapes.enterAlternativeScreen);
		}
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
			options.isBackbufferStickyHeadersEnabled !== undefined &&
			this.isBackbufferStickyHeadersEnabled !==
				options.isBackbufferStickyHeadersEnabled
		) {
			this.isBackbufferStickyHeadersEnabled =
				options.isBackbufferStickyHeadersEnabled;

			this.forceNextRender = true;
		}
	}

	update(
		tree: RegionNode,
		updates: RegionUpdate[],
		cursorPosition?: {row: number; col: number},
	): boolean {
		this.root = tree;
		const previousCursorPosition = this.cursorPosition;
		this.cursorPosition = cursorPosition;

		for (const update of updates) {
			let region = this.regions.get(update.id);

			if (!region) {
				// Initialize new region
				region = {
					id: update.id,
					x: 0,
					y: 0,
					width: 0,
					height: 0,
					lines: [],
					styledOutput: [],
					isScrollable: false,
					stickyHeaders: [],
					children: [],
				};
				this.regions.set(update.id, region);
			}

			if (!region) {
				continue;
			}

			// Apply properties
			if (update.x !== undefined) region.x = update.x;
			if (update.y !== undefined) region.y = update.y;
			if (update.width !== undefined) region.width = update.width;
			if (update.height !== undefined) region.height = update.height;
			if (update.scrollTop !== undefined) region.scrollTop = update.scrollTop;
			if (update.scrollLeft !== undefined)
				region.scrollLeft = update.scrollLeft;
			if (update.scrollHeight !== undefined)
				region.scrollHeight = update.scrollHeight;
			if (update.scrollWidth !== undefined)
				region.scrollWidth = update.scrollWidth;
			if (update.isScrollable !== undefined)
				region.isScrollable = update.isScrollable;
			if (update.isVerticallyScrollable !== undefined)
				region.isVerticallyScrollable = update.isVerticallyScrollable;
			if (update.isHorizontallyScrollable !== undefined)
				region.isHorizontallyScrollable = update.isHorizontallyScrollable;
			if (update.scrollbarVisible !== undefined)
				region.scrollbarVisible = update.scrollbarVisible;
			if (update.overflowToBackbuffer !== undefined)
				region.overflowToBackbuffer = update.overflowToBackbuffer;
			if (update.marginRight !== undefined)
				region.marginRight = update.marginRight;
			if (update.marginBottom !== undefined)
				region.marginBottom = update.marginBottom;
			if (update.scrollbarThumbColor !== undefined)
				region.scrollbarThumbColor = update.scrollbarThumbColor;
			if (update.stickyHeaders !== undefined)
				region.stickyHeaders = update.stickyHeaders;

			// Apply line updates
			if (update.lines) {
				while (region.lines.length < update.lines.totalLength) {
					region.lines.push([]);
				}

				if (region.lines.length > update.lines.totalLength) {
					region.lines.length = update.lines.totalLength;
				}

				for (const chunk of update.lines.updates) {
					const deserializer = new Deserializer(Buffer.from(chunk.data));
					const chunkLines = deserializer.deserialize();

					for (const [i, line] of chunkLines.entries()) {
						region.lines[chunk.start + i] = line!;
					}
				}
			}
		}

		// Check backbuffer dirty
		if (this.root) {
			const rootRegion = this.regions.get(this.root.id);

			if (rootRegion) {
				const cameraY = Math.max(0, rootRegion.height - this.rows);
				for (const update of updates) {
					const region = this.regions.get(update.id);

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

		const rootRegion = this.root ? this.regions.get(this.root.id) : undefined;
		const cameraY = rootRegion ? this.getCameraY(rootRegion) : 0;

		this.syncCursor(cameraY);

		this.terminalWriter.clear();

		this.terminalWriter.writeLines([...this.backbuffer, ...this.screen]);
		this.terminalWriter.finish();
		this.terminalWriter.flush();
		this.terminalWriter.validateLinesConsistent(this.screen);
	}

	async render() {
		if (!this.root) {
			return;
		}

		const rootRegion = this.regions.get(this.root.id);

		if (!rootRegion) {
			return;
		}

		this.forceNextRender = false;

		const cameraY = this.getCameraY(rootRegion);
		this.syncCursor(cameraY);

		if (!this.terminalWriter.isFirstRender) {
			// 0. Handle Global Scroll (Backbuffer growth)
			const maxPushed =
				this.terminalWriter.maxRegionScrollTops.get(rootRegion.id) ?? 0;
			const linesToScroll = cameraY - maxPushed;

			if (linesToScroll > 0) {
				this.appendToBackbuffer(rootRegion, maxPushed, linesToScroll);
				this.terminalWriter.maxRegionScrollTops.set(rootRegion.id, cameraY);
			}

			// 0.5 Handle Local Region Scrolls
			for (const region of this.regions.values()) {
				if (region.isScrollable) {
					const scrollTop = region.scrollTop ?? 0;
					const lastScrollTop =
						this.terminalWriter.lastRegionScrollTops.get(region.id) ?? 0;

					if (scrollTop !== lastScrollTop) {
						if (region.width === this.columns && region.x === 0) {
							// Full-width region, we can use scrolling regions!
							const start = Math.max(0, region.y - cameraY);
							const end = Math.min(
								this.rows,
								region.y + region.height - cameraY,
							);

							if (end > start) {
								const maxPushed =
									this.terminalWriter.maxRegionScrollTops.get(region.id) ?? 0;
								const direction = scrollTop > lastScrollTop ? 'up' : 'down';
								const linesToScroll = Math.abs(scrollTop - lastScrollTop);
								const scrollAreaHeight = end - start;

								const getLinesForScroll = (
									base: number,
									count: number,
								): RenderLine[] => {
									const res: RenderLine[] = [];
									for (let i = 0; i < scrollAreaHeight + count; i++) {
										const contentY = base + i;
										const chars = region.lines[contentY] ?? [];
										res.push(
											this.terminalWriter.clampLine(chars, this.columns),
										);
									}

									return res;
								};

								if (
									direction === 'up' &&
									region.overflowToBackbuffer &&
									start === 0
								) {
									const newLinesToPush = Math.max(0, scrollTop - maxPushed);
									const linesToJustScroll = linesToScroll - newLinesToPush;

									// 1. Scroll and push NEW lines to backbuffer (using sequential writes)
									if (newLinesToPush > 0) {
										const pushBase = Math.max(lastScrollTop, maxPushed);
										this.terminalWriter.scrollLines({
											start,
											end,
											linesToScroll: newLinesToPush,
											lines: getLinesForScroll(pushBase, newLinesToPush),
											direction: 'up',
											scrollToBackbuffer: true,
										});

										this.terminalWriter.maxRegionScrollTops.set(
											region.id,
											scrollTop,
										);
									}

									// 2. Scroll lines that were already in backbuffer (just visual scroll on screen using DL)
									if (linesToJustScroll > 0) {
										const visualBase = lastScrollTop;
										this.terminalWriter.scrollLines({
											start,
											end,
											linesToScroll: linesToJustScroll,
											lines: getLinesForScroll(visualBase, linesToJustScroll),
											direction: 'up',
											scrollToBackbuffer: false,
										});
									}
								} else {
									// Normal scroll: Down (scrolling up doc) OR Up (scrolling down doc) without backbuffer push
									this.terminalWriter.scrollLines({
										start,
										end,
										linesToScroll,
										lines: getLinesForScroll(
											direction === 'up' ? lastScrollTop : scrollTop,
											linesToScroll,
										),
										direction,
										scrollToBackbuffer: false,
									});

									if (
										direction === 'up' &&
										region.overflowToBackbuffer &&
										start === 0
									) {
										this.terminalWriter.maxRegionScrollTops.set(
											region.id,
											Math.max(maxPushed, scrollTop),
										);
									}
								}
							}
						} else if (
							region.overflowToBackbuffer &&
							scrollTop > lastScrollTop
						) {
							// Not full-width, but needs to scroll into backbuffer
							const maxPushed =
								this.terminalWriter.maxRegionScrollTops.get(region.id) ?? 0;
							const startPushed = Math.max(lastScrollTop, maxPushed);
							const countPushed = scrollTop - startPushed;

							if (countPushed > 0) {
								this.appendToBackbuffer(region, startPushed, countPushed);
								this.terminalWriter.maxRegionScrollTops.set(
									region.id,
									scrollTop,
								);
							}
						}

						this.terminalWriter.lastRegionScrollTops.set(region.id, scrollTop);
					}
				} else {
					// Reset tracking if property disabled
					this.terminalWriter.lastRegionScrollTops.delete(region.id);
				}
			}
		}

		// 2. Compose Frame
		this.composeScene();

		if (this.terminalWriter.isFirstRender) {
			this.terminalWriter.writeLines([...this.backbuffer, ...this.screen]);

			// Initialize tracking maps for the first render
			if (rootRegion) {
				this.terminalWriter.maxRegionScrollTops.set(rootRegion.id, cameraY);
			}

			for (const region of this.regions.values()) {
				if (region.isScrollable) {
					this.terminalWriter.lastRegionScrollTops.set(
						region.id,
						region.scrollTop ?? 0,
					);

					if (region.overflowToBackbuffer) {
						this.terminalWriter.maxRegionScrollTops.set(
							region.id,
							region.scrollTop ?? 0,
						);
					}
				}
			}
		} else {
			// 3. Sync
			for (let row = 0; row < this.rows; row++) {
				this.terminalWriter.syncLine(this.screen[row]!, row);
			}
		}

		this.terminalWriter.finish();

		this.terminalWriter.flush();

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

	private composeScene() {
		if (!this.root) {
			return;
		}

		const rootRegion = this.regions.get(this.root.id);

		if (!rootRegion) {
			return;
		}

		const cameraY = this.getCameraY(rootRegion);

		this.backbuffer = [];

		if (!this.isAlternateBufferEnabled) {
			for (let i = 0; i < cameraY; i++) {
				const line = rootRegion.lines[i] ?? [];
				this.backbuffer.push(this.terminalWriter.clampLine(line, this.columns));
			}

			for (const region of this.regions.values()) {
				if (region.overflowToBackbuffer && region.isScrollable) {
					const scrollTop = region.scrollTop ?? 0;

					for (let i = 0; i < scrollTop; i++) {
						const line = region.lines[i] ?? [];
						this.backbuffer.push(
							this.terminalWriter.clampLine(line, this.columns),
						);
					}
				}
			}
		}

		this.screen = [];

		for (let i = 0; i < this.rows; i++) {
			this.screen.push({
				styledChars: [],
				text: '',
				length: 0,
				tainted: this.resized,
			});
		}

		this.resized = false;

		// Render relative to cameraY
		this.composeNode(this.root, {
			clip: undefined,
			offsetY: -cameraY,
		});

		if (this.debugRainbowEnabled) {
			this.frameIndex++;
		}

		const debugRainbowColor = this.debugRainbowEnabled
			? rainbowColors[this.frameIndex % rainbowColors.length]
			: undefined;

		this.terminalWriter.debugRainbowColor = debugRainbowColor;
	}

	private composeNode(
		node: RegionNode,
		{
			clip,
			offsetY = 0,
			offsetX = 0,
		}: {
			clip: {x: number; y: number; w: number; h: number} | undefined;
			offsetY?: number;
			offsetX?: number;
		},
	) {
		const region = this.regions.get(node.id);

		if (!region) {
			return;
		}

		const absX = region.x + offsetX;
		const absY = region.y + offsetY; // Apply camera offset

		// If absY is completely off screen (below), we can skip?
		if (absY >= this.rows) {
			return;
		}

		// If absY + height < 0, skip?
		if (absY + region.height < 0 && !this.isBackbufferStickyHeadersEnabled) {
			return;
		}

		let myClip = {
			x: absX,
			y: absY,
			w: region.width,
			h: region.height,
		};

		if (clip) {
			const x1 = Math.max(myClip.x, clip.x);
			const y1 = Math.max(myClip.y, clip.y);
			const x2 = Math.min(myClip.x + myClip.w, clip.x + clip.w);
			const y2 = Math.min(myClip.y + myClip.h, clip.y + clip.h);

			if (x2 <= x1 || y2 <= y1) {
				return;
			}

			myClip = {x: x1, y: y1, w: x2 - x1, h: y2 - y1};
		}

		const scrollTop = region.scrollTop ?? 0;
		const scrollLeft = region.scrollLeft ?? 0;

		for (let sy = myClip.y; sy < myClip.y + myClip.h; sy++) {
			if (sy < 0 || sy >= this.rows) {
				continue;
			}

			const dy = sy - absY;
			const contentY = scrollTop + dy;

			const line = region.lines[contentY];

			if (!line) {
				continue;
			}

			const targetLine = this.screen[sy];

			if (!targetLine) {
				continue;
			}

			const startSx = myClip.x;
			const endSx = myClip.x + myClip.w;

			while (targetLine.styledChars.length < this.columns) {
				targetLine.styledChars.push({
					type: 'char',
					value: ' ',
					fullWidth: false,
					styles: [],
				});
			}

			for (let sx = startSx; sx < endSx; sx++) {
				if (sx < 0 || sx >= this.columns) {
					continue;
				}

				const dx = sx - absX;
				const contentX = scrollLeft + dx;

				const char = line[contentX];

				if (char) {
					targetLine.styledChars[sx] = char;
				}
			}
		}

		for (const child of node.children) {
			this.composeNode(child, {
				clip: myClip,
				offsetY: absY - scrollTop,
				offsetX: absX - scrollLeft,
			});
		}

		for (const header of region.stickyHeaders) {
			const headerY = header.y + offsetY;
			const headerH = header.lines.length;

			for (let i = 0; i < headerH; i++) {
				const sy = headerY + i;

				// If header is within the region's clip (standard behavior)
				const withinRegionClip = sy >= myClip.y && sy < myClip.y + myClip.h;

				// If header is above the region (due to overflowToBackbuffer) and we want sticky headers there
				const aboveRegionAndStickyEnabled =
					absY < 0 &&
					this.isBackbufferStickyHeadersEnabled &&
					sy >= 0 &&
					sy < Math.min(this.rows, absY + region.height);

				if (!withinRegionClip && !aboveRegionAndStickyEnabled) {
					continue;
				}

				if (sy < 0 || sy >= this.rows) {
					continue;
				}

				const line = header.lines[i];

				if (!line) {
					continue;
				}

				const targetLine = this.screen[sy];

				if (!targetLine) {
					continue;
				}

				const headerX = header.x + offsetX;
				const headerW = line.length;

				const hx1 = Math.max(headerX, myClip.x);
				const hx2 = Math.min(headerX + headerW, myClip.x + myClip.w);

				for (let sx = hx1; sx < hx2; sx++) {
					if (sx < 0 || sx >= this.columns) {
						continue;
					}

					const cx = sx - headerX;
					const char = line[cx];

					if (char) {
						targetLine.styledChars[sx] = char;
					}
				}
			}
		}

		const scrollHeight = region.scrollHeight ?? 0;
		const scrollWidth = region.scrollWidth ?? 0;
		const isVerticalScrollbarVisible =
			(region.isVerticallyScrollable ?? false) && scrollHeight > region.height;
		const isHorizontalScrollbarVisible =
			(region.isHorizontallyScrollable ?? false) && scrollWidth > region.width;

		if (region.isScrollable && (region.scrollbarVisible ?? true)) {
			if (isVerticalScrollbarVisible) {
				const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
					calculateScrollbarThumb({
						scrollbarDimension: region.height,
						clientDimension: region.height,
						scrollDimension: scrollHeight,
						scrollPosition: scrollTop,
						axis: 'vertical',
					});

				const barX = absX + region.width - 1 - (region.marginRight ?? 0);

				renderScrollbar({
					x: barX,
					y: absY,
					thumb: {startIndex, endIndex, thumbStartHalf, thumbEndHalf},
					clip: myClip,
					axis: 'vertical',
					color: region.scrollbarThumbColor,
					setChar: this.setCharOnScreen,
				});
			}

			if (isHorizontalScrollbarVisible) {
				const scrollbarWidth =
					region.width - (isVerticalScrollbarVisible ? 1 : 0);

				const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
					calculateScrollbarThumb({
						scrollbarDimension: scrollbarWidth,
						clientDimension: region.width,
						scrollDimension: scrollWidth,
						scrollPosition: scrollLeft,
						axis: 'horizontal',
					});

				const barY = absY + region.height - 1 - (region.marginBottom ?? 0);

				renderScrollbar({
					x: absX,
					y: barY,
					thumb: {startIndex, endIndex, thumbStartHalf, thumbEndHalf},
					clip: myClip,
					axis: 'horizontal',
					color: region.scrollbarThumbColor,
					setChar: this.setCharOnScreen,
				});
			}
		}
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

	private appendToBackbuffer(region: Region, start: number, count: number) {
		const linesScrollingOut: RenderLine[] = [];

		for (let i = 0; i < count; i++) {
			const lineIndex = start + i;
			const chars = region.lines[lineIndex] ?? [];
			linesScrollingOut.push(
				this.terminalWriter.clampLine(chars, this.columns),
			);
		}

		this.terminalWriter.appendLinesBackbuffer(linesScrollingOut);
	}

	private readonly setCharOnScreen = (
		x: number,
		y: number,
		char: StyledChar,
	) => {
		if (y >= 0 && y < this.rows && x >= 0 && x < this.columns) {
			const targetLine = this.screen[y];
			if (targetLine) {
				while (targetLine.styledChars.length <= x) {
					targetLine.styledChars.push({
						type: 'char',
						value: ' ',
						fullWidth: false,
						styles: [],
					});
				}

				targetLine.styledChars[x] = char;
			}
		}
	};
}

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
					isBackbufferStickyHeadersEnabled:
						message.isBackbufferStickyHeadersEnabled as boolean,
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
