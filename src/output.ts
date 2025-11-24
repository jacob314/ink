import {type StyledChar, styledCharsToString} from '@alcalzone/ansi-tokenize';
import {type OutputTransformer} from './render-node-to-output.js';
import {
	toStyledCharacters,
	inkCharacterWidth,
	styledCharsWidth,
} from './measure-text.js';

/**
"Virtual" output class

Handles the positioning and saving of the output of each node in the tree. Also responsible for applying transformations to each character of the output.

Used to generate the final output of all nodes before writing it to actual output stream (e.g. stdout)
*/

type Options = {
	width: number;
	height: number;
};

type Clip = {
	x1: number | undefined;
	x2: number | undefined;
	y1: number | undefined;
	y2: number | undefined;
};

export type StickyHeader = {
	nodeId: number;
	lines: StyledChar[][];
	x: number;
	y: number; // Absolute Y position relative to the Region's top-left
	startRow: number;
	endRow: number;
	scrollContainerId: number;
};

export type Region = {
	id: number | string;
	x: number; // Absolute screen X
	y: number; // Absolute screen Y
	width: number;
	height: number;

	// Content buffer for this region.
	// Coordinates in `lines` are relative to (0,0) of this region.
	lines: StyledChar[][];

	isScrollable: boolean;

	// Scroll state (if scrollable)
	scrollTop?: number;
	scrollLeft?: number;
	scrollHeight?: number;
	scrollWidth?: number;

	scrollbarVisible?: boolean;
	overflowToBackbuffer?: boolean;

	stickyHeaders: StickyHeader[];
	children: Region[];
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
	scrollbarVisible?: boolean;
	overflowToBackbuffer?: boolean;
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
		const {width, height} = options;

		this.width = width;
		this.height = height;

		this.root = {
			id: 'root',
			x: 0,
			y: 0,
			width,
			height,
			lines: [],
			isScrollable: false,
			stickyHeaders: [],
			children: [],
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

	startChildRegion(options: {
		id: number | string;
		x: number;
		y: number;
		width: number;
		height: number;
		isScrollable: boolean;
		scrollState?: {
			scrollTop: number;
			scrollLeft: number;
			scrollHeight: number;
			scrollWidth: number;
		};
		scrollbarVisible?: boolean;
		overflowToBackbuffer?: boolean;
	}) {
		const {
			id,
			x,
			y,
			width,
			height,
			isScrollable,
			scrollState,
			scrollbarVisible,
			overflowToBackbuffer,
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
			isScrollable,
			scrollTop: scrollState?.scrollTop,
			scrollLeft: scrollState?.scrollLeft,
			scrollHeight: scrollState?.scrollHeight,
			scrollWidth: scrollState?.scrollWidth,
			scrollbarVisible,
			overflowToBackbuffer,
			stickyHeaders: [],
			children: [],
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
		},
	): void {
		const {
			transformers = [],
			lineIndex = 0,
			preserveBackgroundColor = false,
		} = options;

		if (items.length === 0) {
			return;
		}

		this.applyWrite(
			x,
			y,
			items,
			transformers,
			lineIndex,
			preserveBackgroundColor,
		);
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
		return this.root;
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
			const clipResult = this.clipChars(chars, x, y, clip);

			if (!clipResult) {
				return;
			}

			({chars, x, y, fromX, toX} = clipResult);
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

		if (clipVertically && (y < clip.y1! || y >= clip.y2!)) {
			return undefined;
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
