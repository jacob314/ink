import process from 'node:process';
import {Buffer} from 'node:buffer';
import ansiEscapes from 'ansi-escapes';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {debugLog} from '../debug-log.js';
import {calculateScrollbarThumb} from '../measure-element.js';
import {type RegionNode, type RegionUpdate, type Region} from '../output.js';
import {Deserializer} from '../serialization.js';
import {
	type RenderLine,
	TerminalWriter,
	rainbowColors,
} from './terminal-writer.js';

const clearOnDirtyRender = false;

const styledCharsToString = (chars: StyledChar[]): string => {
	return chars.map(char => char.value).join('');
};

export class TerminalBufferWorker {
	// Local state of regions
	regions = new Map<string | number, Region>();
	root?: RegionNode;

	backbufferDirty = false;
	backbufferDirtyCurrentFrame = false;
	fullRenderTimeout?: NodeJS.Timeout;
	frameIndex = 0;
	debugRainbowEnabled = false;
	resized = false;

	// Ground truth on what lines should be rendered (composed frame)
	screen: RenderLine[] = [];
	backbuffer: RenderLine[] = [];

	private readonly terminalWriter: TerminalWriter;
	// Track last scroll top for regions so we can animate scrolling.
	private readonly lastRegionScrollTops = new Map<string | number, number>();

	constructor(
		public columns: number,
		public rows: number,
		options?: {debugRainbowEnabled?: boolean; stdout?: NodeJS.WriteStream},
	) {
		const stdout = options?.stdout ?? process.stdout;
		this.terminalWriter = new TerminalWriter(columns, rows, stdout);
		stdout.write(ansiEscapes.cursorHide);

		if (options?.debugRainbowEnabled) {
			this.debugRainbowEnabled = true;
		}
	}

	update(tree: RegionNode, updates: RegionUpdate[]) {
		this.root = tree;

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
					isScrollable: false,
					stickyHeaders: [],
					children: [],
				};
				this.regions.set(update.id, region);
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
			if (update.scrollbarVisible !== undefined)
				region.scrollbarVisible = update.scrollbarVisible;
			if (update.overflowToBackbuffer !== undefined)
				region.overflowToBackbuffer = update.overflowToBackbuffer;
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
				const totalHeight = rootRegion.height;
				const cameraY = Math.max(0, totalHeight - this.rows);

				for (const update of updates) {
					const region = this.regions.get(update.id);

					if (region && update.lines) {
						for (const chunk of update.lines.updates) {
							const absStart = region.y + chunk.start;

							if (absStart < cameraY) {
								this.backbufferDirty = true;
								this.backbufferDirtyCurrentFrame = true;
							}
						}
					}
				}
			}
		}
	}

	resize(columns: number, rows: number) {
		if (this.columns === columns && this.rows === rows) {
			return;
		}

		this.columns = columns;
		this.rows = rows;

		debugLog(`XXXXX [RENDER-WORKER] Resize to ${columns}x${rows}\n`);
		this.terminalWriter.resize(columns, rows);
		this.backbufferDirtyCurrentFrame = true;
		this.resized = true;
		void this.render();
	}

	fullRender() {
		if (this.fullRenderTimeout) {
			clearTimeout(this.fullRenderTimeout);
		}

		if (!this.backbufferDirty) {
			void this.render();
			return;
		}

		debugLog(`XXXXX [RENDER-WORKER] True full render triggered\n`);

		this.backbufferDirty = false;
		this.backbufferDirtyCurrentFrame = false;

		this.composeScene();

		this.terminalWriter.clear();

		this.terminalWriter.writeLines([
			...this.backbuffer,
			...this.screen,
		]);
		this.terminalWriter.flush();
		this.terminalWriter.validateLinesConsistent(this.screen);
	}

	async render() {
		debugLog(
			`XXXXX [RENDER-WORKER] Render ${this.backbufferDirtyCurrentFrame}}
`,
		);

		for (const region of this.regions.values()) {
			let logMessage = `Region ${region.id} (${region.width}x${region.height}) ${region.x},${region.y}`;

			if (region.isScrollable) {
				logMessage += ` [Scrollable scrollTop=${region.scrollTop} scrollHeight=${region.scrollHeight}]`;
			}

			logMessage += `: ${region.lines[0] ? styledCharsToString(region.lines[0]) : ''}\n`;

			debugLog(logMessage);
		}

		if (!this.root) {
			return;
		}

		const rootRegion = this.regions.get(this.root.id);

		if (!rootRegion) {
			return;
		}

		const totalHeight = rootRegion.height;
		const cameraY = Math.max(0, totalHeight - this.rows);

		const linesToAddToBackbuffer: RenderLine[] = [];

		// 0. Handle Global Scroll (Backbuffer growth)
		const backbufferLength = this.terminalWriter.getBackbufferLength();
		const linesToScroll = cameraY - backbufferLength;

		if (linesToScroll > 0) {
			const linesScrollingOut: RenderLine[] = [];

			for (let i = 0; i < linesToScroll; i++) {
				const lineIndex = backbufferLength + i;
				const chars = rootRegion.lines[lineIndex] ?? [];
				linesScrollingOut.push(
					this.terminalWriter.clampLine(chars, this.columns),
				);
			}

			linesToAddToBackbuffer.push(...linesScrollingOut);
		}

		// 0.5 Handle Local Region Overflow to Backbuffer
		for (const region of this.regions.values()) {
			if (region.overflowToBackbuffer && region.isScrollable) {
				const scrollTop = region.scrollTop ?? 0;
				const lastScrollTop = this.lastRegionScrollTops.get(region.id) ?? 0;

				if (scrollTop > lastScrollTop) {
					const linesToScroll = scrollTop - lastScrollTop;
					// Get lines that are scrolling out (between lastScrollTop and scrollTop)
					const linesScrollingOut: RenderLine[] = [];

					for (let i = 0; i < linesToScroll; i++) {
						const lineIndex = lastScrollTop + i;
						const chars = region.lines[lineIndex] ?? [];
						linesScrollingOut.push(
							this.terminalWriter.clampLine(chars, this.columns),
						);
					}

					// Inject these lines into backbuffer
					linesToAddToBackbuffer.push(...linesScrollingOut);
				}

				this.lastRegionScrollTops.set(
					region.id,
					Math.max(scrollTop, lastScrollTop),
				);
			} else {
				// Reset tracking if property disabled
				this.lastRegionScrollTops.delete(region.id);
			}
		}

		// 2. Compose Frame
		this.composeScene();

		if (linesToAddToBackbuffer.length > 0) {
			this.terminalWriter.appendLinesBackbuffer(linesToAddToBackbuffer);
		}

		// 3. Sync
		for (let row = 0; row < this.rows; row++) {
			this.terminalWriter.syncLine(this.screen[row]!, row);
		}

		await this.terminalWriter.slowFlush();

		if (this.backbufferDirtyCurrentFrame) {
			this.backbufferDirty = true;

			if (this.fullRenderTimeout) {
				clearTimeout(this.fullRenderTimeout);
			}

			this.fullRenderTimeout = setTimeout(() => {
				this.fullRender();
			}, 1000);
		}

		this.backbufferDirtyCurrentFrame = false;
	}

	private composeScene() {
		if (!this.root) {
			return;
		}

		const rootRegion = this.regions.get(this.root.id);

		if (!rootRegion) {
			return;
		}

		const totalHeight = rootRegion.height;
		const cameraY = Math.max(0, totalHeight - this.rows);

		this.backbuffer = [];

		for (let i = 0; i < cameraY; i++) {
			const line = rootRegion.lines[i] ?? [];
			this.backbuffer.push(
				this.terminalWriter.clampLine(line, this.columns),
			);
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
		this.composeNode(this.root, undefined, -cameraY);

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
		clip: {x: number; y: number; w: number; h: number} | undefined,
		offsetY = 0,
	) {
		const region = this.regions.get(node.id);

		if (!region) {
			return;
		}

		const absX = region.x;
		const absY = region.y + offsetY; // Apply camera offset

		// If absY is completely off screen (below), we can skip?
		if (absY >= this.rows) {
			return;
		}

		// If absY + height < 0, skip?
		if (absY + region.height < 0) {
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
			this.composeNode(child, myClip, offsetY);
		}

		for (const header of region.stickyHeaders) {
			const headerY = header.y + offsetY;
			const headerH = header.lines.length;

			for (let i = 0; i < headerH; i++) {
				const sy = headerY + i;

				if (sy < myClip.y || sy >= myClip.y + myClip.h) {
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

				const headerX = header.x;
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

		if (
			region.isScrollable &&
			(region.scrollbarVisible ?? true) &&
			scrollHeight > region.height
		) {
			const {startIndex, endIndex} = calculateScrollbarThumb({
				scrollbarDimension: region.height,
				clientDimension: region.height,
				scrollDimension: scrollHeight,
				scrollPosition: scrollTop,
				axis: 'vertical',
			});

			const barX = absX + region.width - 1;
			const char = '█';

			for (let i = startIndex; i < endIndex; i++) {
				const sy = absY + i;

				if (
					sy >= myClip.y &&
					sy < myClip.y + myClip.h &&
					sy >= 0 &&
					sy < this.rows &&
					barX >= 0 &&
					barX < this.columns
				) {
					const targetLine = this.screen[sy];

					if (targetLine) {
						while (targetLine.styledChars.length <= barX) {
							targetLine.styledChars.push({
								type: 'char',
								value: ' ',
								fullWidth: false,
								styles: [],
							});
						}

						targetLine.styledChars[barX] = {
							type: 'char',
							value: char,
							fullWidth: false,
							styles: [],
						};
					}
				}
			}
		}
	}
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
				});
				break;
			}

			case 'edits': {
				if (buffer) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					buffer.update(message.tree, message.updates);
				}

				break;
			}

			case 'fullRender': {
				if (buffer) {
					buffer.fullRender();
				}

				break;
			}

			case 'render': {
				if (buffer) {
					void buffer.render();
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
