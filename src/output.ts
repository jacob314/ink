import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import {type OutputTransformer} from './render-node-to-output.js';
import {
	toStyledCharacters,
	inkCharacterWidth,
	styledCharsWidth,
} from './measure-text.js';
import {type CursorPosition} from './log-update.js';
import {type StickyHeader, type DOMElement} from './dom.js';
import {calculateScrollbarThumb} from './measure-element.js';
import {renderScrollbar} from './render-scrollbar.js';

/**
"Virtual" output class

Handles the positioning and saving of the output of each node in the tree. Also responsible for applying transformations to each character of the output.

Used to generate the final output of all nodes before writing it to actual output stream (e.g. stdout)
*/

type Options = {
	width: number;
	height: number;
	node?: DOMElement;
};

type Clip = {
	x1: number | undefined;
	x2: number | undefined;
	y1: number | undefined;
	y2: number | undefined;
};

export type Region = {
	id: number | string;
	x: number; // Position relative to parent region's content start
	y: number; // Position relative to parent region's content start
	width: number;
	height: number;

	// Content buffer for this region.
	// Coordinates in `lines` are relative to (0,0) of this region.
	lines: StyledChar[][];
	styledOutput: StyledChar[][];

	isScrollable: boolean;
	isVerticallyScrollable?: boolean;
	isHorizontallyScrollable?: boolean;

	// Scroll state (if scrollable)
	scrollTop?: number;
	scrollLeft?: number;
	scrollHeight?: number;
	scrollWidth?: number;

	scrollbarVisible?: boolean;
	overflowToBackbuffer?: boolean;
	marginRight?: number;
	marginBottom?: number;
	scrollbarThumbColor?: string;

	stickyHeaders: StickyHeader[];
	children: Region[];
	cursorPosition?: CursorPosition;
	stableScrollback?: boolean;
	nodeId?: number;
	node?: DOMElement;
};

export type RegionNode = {
	id: string | number;
	children: RegionNode[];
};

export type RegionUpdate = {
	id: string | number;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	scrollTop?: number;
	scrollLeft?: number;
	scrollHeight?: number;
	scrollWidth?: number;
	isScrollable?: boolean;
	isVerticallyScrollable?: boolean;
	isHorizontallyScrollable?: boolean;
	scrollbarVisible?: boolean;
	overflowToBackbuffer?: boolean;
	marginRight?: number;
	marginBottom?: number;
	scrollbarThumbColor?: string;
	stickyHeaders?: StickyHeader[];
	lines?: {
		updates: Array<{
			start: number;
			end: number;
			data: Uint8Array;
			source?: Uint8Array;
		}>;
		totalLength: number;
	};
};

export default class Output {
	width: number;
	height: number;

	// The root region represents the main screen area (non-scrollable background)
	root: Region;

	private readonly activeRegionStack: Region[] = [];
	private readonly clips: Clip[] = [];

	constructor(options: Options) {
		const {width, height, node} = options;

		this.width = width;
		this.height = height;

		this.root = {
			id: 'root',
			x: 0,
			y: 0,
			width,
			height,
			lines: [],
			styledOutput: [],
			isScrollable: false,
			stickyHeaders: [],
			children: [],
			node,
		};

		this.initLines(this.root, width, height);
		this.activeRegionStack.push(this.root);
	}

	getCurrentClip(): Clip | undefined {
		return this.clips.at(-1);
	}

	getActiveRegion(): Region {
		return this.activeRegionStack.at(-1)!;
	}

	getRegionAbsoluteOffset(): {x: number; y: number} {
		let x = 0;
		let y = 0;

		for (const region of this.activeRegionStack) {
			x += region.x - (region.scrollLeft ?? 0);
			y += region.y - (region.scrollTop ?? 0);
		}

		return {x, y};
	}

	startChildRegion(options: {
		id: number | string;
		x: number;
		y: number;
		width: number;
		height: number;
		isScrollable: boolean;
		isVerticallyScrollable?: boolean;
		isHorizontallyScrollable?: boolean;
		scrollState?: {
			scrollTop: number;
			scrollLeft: number;
			scrollHeight: number;
			scrollWidth: number;
		};
		scrollbarVisible?: boolean;
		overflowToBackbuffer?: boolean;
		marginRight?: number;
		marginBottom?: number;
		scrollbarThumbColor?: string;
		nodeId?: number;
		stableScrollback?: boolean;
	}) {
		const {
			id,
			x,
			y,
			width,
			height,
			isScrollable,
			isVerticallyScrollable,
			isHorizontallyScrollable,
			scrollState,
			scrollbarVisible,
			overflowToBackbuffer,
			marginRight,
			marginBottom,
			scrollbarThumbColor,
			nodeId,
			stableScrollback,
		} = options;

		// Create new region
		// The buffer size should match scrollDimensions if scrollable, or bounds if not.
		// If scrollable, we want to capture the FULL content.
		const bufferWidth = scrollState?.scrollWidth ?? width;
		const bufferHeight = scrollState?.scrollHeight ?? height;

		const region: Region = {
			id,
			x,
			y,
			width,
			height,
			lines: [],
			styledOutput: [],
			isScrollable,
			isVerticallyScrollable,
			isHorizontallyScrollable,
			scrollTop: scrollState?.scrollTop,
			scrollLeft: scrollState?.scrollLeft,
			scrollHeight: scrollState?.scrollHeight,
			scrollWidth: scrollState?.scrollWidth,
			scrollbarVisible,
			overflowToBackbuffer,
			marginRight,
			marginBottom,
			scrollbarThumbColor,
			stickyHeaders: [],
			children: [],
			nodeId,
			stableScrollback,
		};

		this.initLines(region, bufferWidth, bufferHeight);

		// Add to current active region's children
		this.getActiveRegion().children.push(region);

		// Push to stack
		this.activeRegionStack.push(region);
	}

	endChildRegion() {
		if (this.activeRegionStack.length > 1) {
			this.activeRegionStack.pop();
		}
	}

	addStickyHeader(header: StickyHeader) {
		this.getActiveRegion().stickyHeaders.push(header);
	}

	write(
		x: number,
		y: number,
		items: string | StyledChar[],
		options: {
			transformers: OutputTransformer[];
			lineIndex?: number;
			preserveBackgroundColor?: boolean;
			isTerminalCursorFocused?: boolean;
			terminalCursorPosition?: number;
		},
	): void {
		const {
			transformers = [],
			lineIndex = 0,
			preserveBackgroundColor = false,
			isTerminalCursorFocused = false,
			terminalCursorPosition,
		} = options;

		if (items.length === 0 && !isTerminalCursorFocused) {
			return;
		}

		if (isTerminalCursorFocused) {
			const region = this.getActiveRegion();
			let col = 0;
			let row = 0;
			const chars =
				typeof items === 'string' ? toStyledCharacters(items) : items;
			let charOffset = 0;
			const targetOffset = terminalCursorPosition ?? Number.POSITIVE_INFINITY;

			for (const char of chars) {
				if (charOffset >= targetOffset) {
					break;
				}

				if (char.value === '\n') {
					row++;
					col = 0;
				} else {
					col += inkCharacterWidth(char.value);
				}

				charOffset += char.value.length;
			}

			region.cursorPosition = {
				row: y + row,
				col: x + col,
			};
		}

		if (items.length > 0) {
			this.applyWrite(
				x,
				y,
				items,
				transformers,
				lineIndex,
				preserveBackgroundColor,
			);
		}
	}

	clip(clip: Clip) {
		const previousClip = this.clips.at(-1);
		const nextClip = {...clip};

		if (previousClip) {
			nextClip.x1 =
				previousClip.x1 === undefined
					? nextClip.x1
					: nextClip.x1 === undefined
						? previousClip.x1
						: Math.max(previousClip.x1, nextClip.x1);

			nextClip.x2 =
				previousClip.x2 === undefined
					? nextClip.x2
					: nextClip.x2 === undefined
						? previousClip.x2
						: Math.min(previousClip.x2, nextClip.x2);

			nextClip.y1 =
				previousClip.y1 === undefined
					? nextClip.y1
					: nextClip.y1 === undefined
						? previousClip.y1
						: Math.max(previousClip.y1, nextClip.y1);

			nextClip.y2 =
				previousClip.y2 === undefined
					? nextClip.y2
					: nextClip.y2 === undefined
						? previousClip.y2
						: Math.min(previousClip.y2, nextClip.y2);
		}

		this.clips.push(nextClip);
	}

	unclip() {
		this.clips.pop();
	}

	get(): Region {
		this.clampCursorPosition(this.root);
		this.trimRegionLines(this.root);
		return this.root;
	}

	addRegionTree(region: Region, x: number, y: number) {
		const activeRegion = this.getActiveRegion();

		// 1. Write the lines of the cached root region into the active region
		for (let row = 0; row < region.lines.length; row++) {
			const line = region.lines[row];
			if (line) {
				this.applyWrite(x, y + row, line, [], 0, false);
			}
		}

		// 2. Add children regions
		for (const child of region.children) {
			const clonedChild = this.cloneRegion(child, x, y);
			activeRegion.children.push(clonedChild);
		}

		// 3. Add sticky headers
		for (const header of region.stickyHeaders) {
			activeRegion.stickyHeaders.push({
				...header,
				x: header.x + x,
				y: header.y + y,
			});
		}
	}

	private cloneRegion(region: Region, x: number, y: number): Region {
		const cloned: Region = {
			...region,
			x: region.x + x,
			y: region.y + y,
			stickyHeaders: region.stickyHeaders.map(header => ({
				...header,
				x: header.x,
				y: header.y,
			})),
			children: region.children.map(child => this.cloneRegion(child, 0, 0)),
		};

		return cloned;
	}

	private trimRegionLines(region: Region) {
		for (let y = 0; y < region.lines.length; y++) {
			const line = region.lines[y]!;
			let lastNonSpace = -1;

			for (let i = line.length - 1; i >= 0; i--) {
				const char = line[i]!;

				if (char.value !== ' ' || char.styles.length > 0) {
					lastNonSpace = i;
					break;
				}
			}

			region.styledOutput[y] = line.slice(0, lastNonSpace + 1);
		}

		for (const child of region.children) {
			this.trimRegionLines(child);
		}
	}

	private clampCursorPosition(region: Region) {
		if (region.cursorPosition) {
			const {row, col} = region.cursorPosition;
			const line = region.lines[row];

			if (line) {
				let currentLineCol = 0;
				let lastContentCol = 0;

				for (const char of line) {
					const charWidth = char.fullWidth ? 2 : 1;

					if (char.value !== ' ' || char.styles.length > 0) {
						lastContentCol = currentLineCol + charWidth;
					}

					currentLineCol += charWidth;
				}

				if (col > lastContentCol) {
					region.cursorPosition.col = lastContentCol;
				}
			}
		}

		for (const child of region.children) {
			this.clampCursorPosition(child);
		}
	}

	private initLines(region: Region, width: number, height: number) {
		for (let y = 0; y < height; y++) {
			const row: StyledChar[] = [];
			for (let x = 0; x < width; x++) {
				row.push({
					type: 'char',
					value: ' ',
					fullWidth: false,
					styles: [],
				});
			}

			region.lines.push(row);
			region.styledOutput.push(row);
		}
	}

	// Helper to apply write immediately
	// eslint-disable-next-line max-params
	private applyWrite(
		x: number,
		y: number,
		items: string | StyledChar[],
		transformers: OutputTransformer[],
		lineIndex: number,
		_preserveBackgroundColor: boolean,
	) {
		const region = this.getActiveRegion();
		const {lines} = region;
		const bufferWidth = lines[0]?.length ?? 0;

		let chars: StyledChar[] =
			typeof items === 'string' ? toStyledCharacters(items) : items;

		const clip = this.getCurrentClip();
		let fromX: number | undefined;
		let toX: number | undefined;

		if (clip) {
			const regionOffset = this.getRegionAbsoluteOffset();
			const clipResult = this.clipChars(
				chars,
				x + regionOffset.x,
				y + regionOffset.y,
				clip,
			);

			if (!clipResult) {
				return;
			}

			let absoluteX: number;
			let absoluteY: number;

			({chars, x: absoluteX, y: absoluteY, fromX, toX} = clipResult);
			x = absoluteX - regionOffset.x;
			y = absoluteY - regionOffset.y;
		}

		const currentLine = lines[y];

		if (!currentLine) {
			return;
		}

		if (transformers.length > 0) {
			let line = styledCharsToString(chars);
			for (const transformer of transformers) {
				line = transformer(line, lineIndex);
			}

			chars = toStyledCharacters(line);
		}

		let offsetX = x;
		let relativeX = 0;

		for (const character of chars) {
			const characterWidth = inkCharacterWidth(character.value);

			if (toX !== undefined && relativeX >= toX) {
				break;
			}

			if (fromX === undefined || relativeX >= fromX) {
				if (offsetX >= bufferWidth) {
					break;
				}

				currentLine[offsetX] = character;

				if (characterWidth > 1) {
					this.clearRange(
						currentLine,
						{start: offsetX + 1, end: offsetX + characterWidth},
						character.styles,
						'',
						bufferWidth,
					);
				}

				offsetX += characterWidth;
			} else if (
				characterWidth > 1 &&
				fromX !== undefined &&
				relativeX < fromX &&
				relativeX + characterWidth > fromX
			) {
				const clearLength = relativeX + characterWidth - fromX;
				this.clearRange(
					currentLine,
					{start: offsetX, end: offsetX + clearLength},
					character.styles,
					' ',
					bufferWidth,
				);

				offsetX += clearLength;
			}

			relativeX += characterWidth;
		}

		if (toX !== undefined) {
			const absoluteToX = x - (fromX ?? 0) + toX;

			this.clearRange(
				currentLine,
				{start: offsetX, end: absoluteToX},
				[],
				' ',
				bufferWidth,
			);
		}
	}

	// eslint-disable-next-line max-params
	private clearRange(
		currentLine: StyledChar[],
		range: {start: number; end: number},
		styles: StyledChar['styles'],
		value: string,
		maxWidth: number,
	) {
		for (let offset = range.start; offset < range.end; offset++) {
			if (offset >= 0 && offset < maxWidth) {
				currentLine[offset] = {
					type: 'char',
					value,
					fullWidth: false,
					styles,
				};
			}
		}
	}

	private clipChars(
		chars: StyledChar[],
		x: number,
		y: number,
		clip: Clip,
	):
		| {
				chars: StyledChar[];
				x: number;
				y: number;
				fromX: number | undefined;
				toX: number | undefined;
		  }
		| undefined {
		const {x1, x2, y1, y2} = clip;
		const clipHorizontally = typeof x1 === 'number' && typeof x2 === 'number';
		const clipVertically = typeof y1 === 'number' && typeof y2 === 'number';

		if (clipHorizontally) {
			const width = styledCharsWidth(chars);

			if (x + width < clip.x1! || x > clip.x2!) {
				return undefined;
			}
		}

		if (clipVertically) {
			const effectiveY1 = this.getActiveRegion().overflowToBackbuffer
				? -Infinity
				: clip.y1!;

			if (y < effectiveY1 || y >= clip.y2!) {
				return undefined;
			}
		}

		let fromX: number | undefined;
		let toX: number | undefined;

		if (clipHorizontally) {
			fromX = x < clip.x1! ? clip.x1! - x : 0;
			const width = styledCharsWidth(chars);
			toX = x + width > clip.x2! ? clip.x2! - x : width;

			if (x < clip.x1!) {
				x = clip.x1!;
			}
		}

		return {chars, x, y, fromX, toX};
	}
}

export function flattenRegion(
	root: Region,
	options?: {
		context?: {cursorPosition?: {row: number; col: number}};
		skipScrollbars?: boolean;
		skipStickyHeaders?: boolean;
	},
): StyledChar[][] {
	const {width, height} = root;

	const lines: StyledChar[][] = Array.from({length: height}, () =>
		Array.from({length: width}, () => ({
			type: 'char',
			value: ' ',
			fullWidth: false,
			styles: [],
		})),
	);

	composeRegion(
		root,
		lines,
		{
			clip: {x: 0, y: 0, w: width, h: height},
		},
		options,
	);
	return lines;
}

function composeRegion(
	region: Region,
	targetLines: StyledChar[][],
	{
		clip,
		offsetX = 0,
		offsetY = 0,
	}: {
		clip: {x: number; y: number; w: number; h: number};
		offsetX?: number;
		offsetY?: number;
	},
	options?: {
		context?: {cursorPosition?: {row: number; col: number}};
		skipScrollbars?: boolean;
		skipStickyHeaders?: boolean;
	},
) {
	const {
		x,
		y,
		width,
		height,
		lines,
		children,
		stickyHeaders,
		scrollTop: regionScrollTop,
		scrollLeft: regionScrollLeft,
		cursorPosition: regionCursorPosition,
	} = region;
	const absX = x + offsetX;
	const absY = y + offsetY;

	const {x: clipX, y: clipY, w: clipW, h: clipH} = clip;

	const x1 = Math.max(clipX, absX);
	const y1 = Math.max(clipY, absY);
	const x2 = Math.min(clipX + clipW, absX + width);
	const y2 = Math.min(clipY + clipH, absY + height);

	if (x2 <= x1 || y2 <= y1) {
		return;
	}

	const myClip = {x: x1, y: y1, w: x2 - x1, h: y2 - y1};

	const scrollTop = regionScrollTop ?? 0;
	const scrollLeft = regionScrollLeft ?? 0;

	if (regionCursorPosition && options?.context) {
		const cursorX = absX + regionCursorPosition.col - scrollLeft;
		const cursorY = absY + regionCursorPosition.row - scrollTop;

		if (cursorX >= x1 && cursorX <= x2 && cursorY >= y1 && cursorY <= y2) {
			options.context.cursorPosition = {row: cursorY, col: cursorX};
		}
	}

	const {x: myClipX, y: myClipY, w: myClipW, h: myClipH} = myClip;

	for (let sy = myClipY; sy < myClipY + myClipH; sy++) {
		const row = targetLines[sy];
		if (!row) {
			continue;
		}

		const localY = sy - absY + scrollTop;
		const sourceLine = lines[localY];
		if (!sourceLine) {
			continue;
		}

		for (let sx = myClipX; sx < myClipX + myClipW; sx++) {
			const localX = sx - absX + scrollLeft;
			const char = sourceLine[localX];
			if (char) {
				row[sx] = char;
			}
		}
	}

	for (const child of children) {
		composeRegion(
			child,
			targetLines,
			{
				clip: myClip,
				offsetX: absX - scrollLeft,
				offsetY: absY - scrollTop,
			},
			options,
		);
	}

	if (!options?.skipStickyHeaders) {
		for (const header of stickyHeaders) {
			const headerY = header.y + absY; // Absolute Y
			const headerH = header.styledOutput.length;

			for (let i = 0; i < headerH; i++) {
				const sy = headerY + i;
				if (sy < myClipY || sy >= myClipY + myClipH) {
					continue;
				}

				const row = targetLines[sy];
				if (!row) {
					continue;
				}

				const line = header.styledOutput[i];
				if (!line) {
					continue;
				}

				const headerX = header.x + absX;
				const headerW = line.length;

				const hx1 = Math.max(headerX, myClipX);
				const hx2 = Math.min(headerX + headerW, myClipX + myClipW);

				for (let sx = hx1; sx < hx2; sx++) {
					const cx = sx - headerX;
					const char = line[cx];
					if (char) {
						row[sx] = char;
					}
				}
			}
		}
	}

	if (
		!options?.skipScrollbars &&
		region.isScrollable &&
		(region.scrollbarVisible ?? true)
	) {
		const scrollHeight = region.scrollHeight ?? 0;
		const scrollWidth = region.scrollWidth ?? 0;
		const isVerticalScrollbarVisible =
			(region.isVerticallyScrollable ?? false) && scrollHeight > region.height;
		const isHorizontalScrollbarVisible =
			(region.isHorizontallyScrollable ?? false) && scrollWidth > region.width;

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
				setChar(x, y, char) {
					if (
						y >= 0 &&
						y < targetLines.length &&
						x >= 0 &&
						x < targetLines[0]!.length
					) {
						targetLines[y]![x] = char;
					}
				},
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
				setChar(x, y, char) {
					if (
						y >= 0 &&
						y < targetLines.length &&
						x >= 0 &&
						x < targetLines[0]!.length
					) {
						targetLines[y]![x] = char;
					}
				},
			});
		}
	}
}
