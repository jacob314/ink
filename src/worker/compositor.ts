import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {type Region} from '../output.js';
import {type StickyHeader} from '../dom.js';
import {calculateScrollbarThumb} from '../measure-element.js';
import {renderScrollbar} from '../render-scrollbar.js';
import {toStyledCharacters} from '../measure-text.js';
import colorize from '../colorize.js';
import {type Canvas, type Rect} from './canvas.js';

export type CompositionOptions = {
	skipStickyHeaders?: boolean;
	skipScrollbars?: boolean;
	stickyHeadersInBackbuffer?: boolean;
	animatedScroll?: boolean;
	targetScrollTops: ReadonlyMap<string | number, number>;
	regionWasAtEnd: Map<string | number, boolean>;
	canvasHeight: number;
};

/**
 * Handles rendering of various UI elements onto a Canvas.
 */
export class Compositor {
	private static lastBackgroundColor?: string;
	private static lastBackgroundStyles: StyledChar['styles'] = [];

	constructor(private readonly options: CompositionOptions) {}

	drawContent(
		canvas: Canvas,
		region: Region,
		absX: number,
		absY: number,
		clip: Rect,
	) {
		const scrollTop = region.scrollTop ?? 0;
		const scrollLeft = region.scrollLeft ?? 0;

		const isOpaque = Boolean(region.opaque) || Boolean(region.backgroundColor);

		for (let sy = clip.y; sy < clip.y + clip.h; sy++) {
			if (sy < 0 || sy >= canvas.height) {
				continue;
			}

			const dy = sy - absY;
			const contentY = Math.round(scrollTop + dy);

			const line = region.lines[contentY];
			if (!line) {
				continue;
			}

			const startSx = Math.round(clip.x);
			const endSx = Math.round(clip.x + clip.w);

			for (let sx = startSx; sx < endSx; sx++) {
				if (sx < 0 || sx >= canvas.width) {
					continue;
				}

				const dx = sx - absX;
				const contentX = scrollLeft + dx;

				let char = line[contentX];
				if (char) {
					const isEmpty = char.value === ' ' && char.styles.length === 0;

					if (isEmpty) {
						if (!isOpaque) {
							continue;
						}

						if (region.backgroundColor) {
							// Apply background to empty char
							char = {
								...char,
								styles: [
									...char.styles,
									...this.getBackgroundStyles(region.backgroundColor),
								],
							};
						}
					}

					canvas.setChar(sx, sy, char);
				}
			}
		}
	}

	drawStickyHeaders(
		canvas: Canvas,
		region: Region,
		absX: number,
		absY: number,
		clip: Rect,
	) {
		if (this.options.skipStickyHeaders) {
			return;
		}

		const scrollTop = region.scrollTop ?? 0;

		for (const header of region.stickyHeaders) {
			const useStuckPosition = this.isHeaderStuck(header, absY, scrollTop);

			if (!useStuckPosition && header.isStuckOnly) {
				continue;
			}

			const linesToRender = useStuckPosition
				? (header.stuckLines ?? header.lines)
				: header.lines;

			let headerY =
				absY + (useStuckPosition ? header.y : header.naturalRow - scrollTop);
			const headerH = linesToRender.length;

			if (this.options.stickyHeadersInBackbuffer) {
				if (header.type === 'top') {
					if (headerY < absY + header.y && absY + region.height > absY + header.y) {
						headerY = absY + header.y;
					}
				} else if (header.type === 'bottom') {
					const stuckPos = this.options.canvasHeight - (header.stuckLines ?? header.lines).length;
					if (headerY > stuckPos && absY < stuckPos + headerH) {
						headerY = stuckPos;
					}
				}
			}

			for (let i = 0; i < headerH; i++) {
				const sy = Math.round(headerY + i);

				// If header is within the region's clip (standard behavior)
				const withinRegionClip = sy >= clip.y && sy < clip.y + clip.h;

				// If header is above the region (due to overflowToBackbuffer) and we want sticky headers there
				const aboveRegionAndStickyEnabled =
					absY < 0 &&
					this.options.stickyHeadersInBackbuffer &&
					sy >= 0 &&
					sy < Math.min(canvas.height, absY + region.height);

				if (!withinRegionClip && !aboveRegionAndStickyEnabled) {
					continue;
				}

				if (sy < 0 || sy >= canvas.height) {
					continue;
				}

				const line = linesToRender[i];
				if (!line) {
					continue;
				}

				const headerX = Math.round(header.x + absX);
				const headerW = Math.round(line.length);

				const hx1 = Math.max(headerX, clip.x);
				const hx2 = Math.min(headerX + headerW, clip.x + clip.w);

				for (let sx = hx1; sx < hx2; sx++) {
					const cx = sx - headerX;
					const char = line[cx];

					if (char) {
						canvas.setChar(sx, sy, char);
					}
				}
			}
		}
	}

	drawScrollbars(
		canvas: Canvas,
		region: Region,
		absX: number,
		absY: number,
		clip: Rect,
	) {
		if (
			(this.options.skipScrollbars ?? false) ||
			!region.isScrollable ||
			region.scrollbarVisible === false
		) {
			return;
		}

		const scrollTop = region.scrollTop ?? 0;
		const scrollLeft = region.scrollLeft ?? 0;
		const scrollHeight = region.scrollHeight ?? 0;
		const scrollWidth = region.scrollWidth ?? 0;

		const isVerticalScrollbarVisible =
			(region.isVerticallyScrollable ?? false) && scrollHeight > region.height;
		const isHorizontalScrollbarVisible =
			(region.isHorizontallyScrollable ?? false) && scrollWidth > region.width;

		if (isVerticalScrollbarVisible) {
			let scrollPosition = scrollTop;
			const targetScrollTop = this.options.targetScrollTops.get(region.id);
			if (
				this.options.animatedScroll &&
				targetScrollTop !== undefined &&
				targetScrollTop !== scrollTop
			) {
				const wasAtEnd = this.options.regionWasAtEnd.get(region.id);
				const isTargetAtEnd = targetScrollTop >= scrollHeight - region.height;
				if (wasAtEnd && isTargetAtEnd) {
					scrollPosition = targetScrollTop;
				}
			}

			const {startIndex, endIndex, thumbStartHalf, thumbEndHalf} =
				calculateScrollbarThumb({
					scrollbarDimension: region.height,
					clientDimension: region.height,
					scrollDimension: scrollHeight,
					scrollPosition,
					axis: 'vertical',
				});

			const barX = absX + region.width - 1 - (region.marginRight ?? 0);

			renderScrollbar({
				x: barX,
				y: absY,
				thumb: {startIndex, endIndex, thumbStartHalf, thumbEndHalf},
				clip,
				axis: 'vertical',
				color: region.scrollbarThumbColor,
				setChar(x, y, char) {
					canvas.setChar(x, y, char);
				},
				getExistingChar(x, y) {
					return canvas.getChar(x, y);
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
				clip,
				axis: 'horizontal',
				color: region.scrollbarThumbColor,
				setChar(x, y, char) {
					canvas.setChar(x, y, char);
				},
				getExistingChar(x, y) {
					return canvas.getChar(x, y);
				},
			});
		}
	}

	isHeaderStuck(
		header: StickyHeader,
		absY: number,
		scrollTop: number,
	): boolean {
		const isStuckState =
			header.type === 'bottom'
				? Math.round(header.naturalRow - scrollTop + header.lines.length) >=
					Math.round(header.y + (header.stuckLines ?? header.lines).length)
				: Math.round(header.naturalRow - scrollTop) <= Math.round(header.type === 'top' ? 0 : header.y);

		if (!isStuckState) {
			return false;
		}

		if (header.type === 'top') {
			return (this.options.stickyHeadersInBackbuffer ?? false) || absY > 0;
		}

		return true;
	}

	calculateActualStuckTopHeight(
		region: Region,
		absY: number,
		scrollTop: number,
	): number {
		let stuckHeight = 0;
		const topHeaders = [...region.stickyHeaders]
			.filter(h => h.type === 'top')
			.sort((a, b) => a.y - b.y);

		for (const header of topHeaders) {
			if (
				this.isHeaderStuck(header, absY, scrollTop) &&
				Math.abs(Math.round(header.y) - stuckHeight) < 0.5
			) {
				const linesToRender = header.stuckLines ?? header.lines;
				stuckHeight += linesToRender.length;
			} else if (this.isHeaderStuck(header, absY, scrollTop)) {
				break;
			}
		}

		return stuckHeight;
	}

	calculateActualStuckBottomHeight(
		region: Region,
		absY: number,
		scrollTop: number,
	): number {
		let stuckHeight = 0;
		const bottomHeaders = [...region.stickyHeaders]
			.filter(h => h.type === 'bottom')
			.sort((a, b) => b.y - a.y);

		for (const header of bottomHeaders) {
			if (this.isHeaderStuck(header, absY, scrollTop)) {
				const linesToRender = header.stuckLines ?? header.lines;
				const footerRowInRegion =
					region.height - linesToRender.length - stuckHeight;
				if (Math.round(header.y) === Math.round(footerRowInRegion)) {
					stuckHeight += linesToRender.length;
				} else {
					break;
				}
			}
		}

		return stuckHeight;
	}

	private getBackgroundStyles(color: string) {
		if (color === Compositor.lastBackgroundColor) {
			return Compositor.lastBackgroundStyles;
		}

		const styled = toStyledCharacters(colorize(' ', color, 'background'))[0];
		const styles = styled?.styles ?? [];

		Compositor.lastBackgroundColor = color;
		Compositor.lastBackgroundStyles = styles;

		return styles;
	}
}
