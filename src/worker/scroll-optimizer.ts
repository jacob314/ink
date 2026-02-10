import {type Region} from '../output.js';
import {type RenderLine} from './terminal-writer.js';

export type ScrollOperation = {
	start: number;
	end: number;
	linesToScroll: number;
	lines: RenderLine[];
	direction: 'up' | 'down';
	scrollToBackbuffer: boolean;
	regionId: string | number;
	newMaxPushed?: number;
};

/**
 * Optimized decision-making for terminal hardware scrolling.
 * Tracks what has been scrolled and pushed to the backbuffer.
 */
export class ScrollOptimizer {
	maxRegionScrollTops = new Map<string | number, number>();
	lastRegionScrollTops = new Map<string | number, number>();

	/**
	 * Determines if a region scroll can be optimized with hardware scrolling.
	 */
	calculateScrollOperations(
		region: Region,
		rows: number,
		columns: number,
		cameraY: number,
		getLinesForScroll: (scrollStart: number, count: number) => RenderLine[],
		calculateStuckTopHeight: (
			region: Region,
			absY: number,
			scrollTop: number,
		) => number,
		calculateStuckBottomHeight: (
			region: Region,
			absY: number,
			scrollTop: number,
		) => number,
	): ScrollOperation[] {
		if (!region.isScrollable) {
			this.lastRegionScrollTops.delete(region.id);
			return [];
		}

		const scrollTop = region.scrollTop ?? 0;
		const lastScrollTop = this.lastRegionScrollTops.get(region.id) ?? 0;

		if (scrollTop === lastScrollTop) {
			return [];
		}

		const absY = Math.round(region.y - cameraY);
		const start = Math.max(0, absY);
		const regionHeight = Math.round(region.height);
		const end = Math.min(rows, absY + regionHeight);

		const actualStuckTopHeight = calculateStuckTopHeight(
			region,
			absY,
			scrollTop,
		);
		const actualStuckBottomHeight = calculateStuckBottomHeight(
			region,
			absY,
			scrollTop,
		);

		const adjustedStart = Math.round(
			Math.max(start, absY + actualStuckTopHeight),
		);
		const adjustedEnd = Math.round(
			Math.min(end, absY + regionHeight - actualStuckBottomHeight),
		);

		if (adjustedEnd <= adjustedStart) {
			this.lastRegionScrollTops.set(region.id, scrollTop);
			return [];
		}

		const maxPushed = this.maxRegionScrollTops.get(region.id) ?? 0;
		const direction = scrollTop > lastScrollTop ? 'up' : 'down';
		const linesToScroll = Math.abs(scrollTop - lastScrollTop);

		const operations: ScrollOperation[] = [];

		if (
			direction === 'up' &&
			region.overflowToBackbuffer &&
			adjustedStart === 0 &&
			region.width === columns &&
			region.x === 0
		) {
			const newLinesToPush = Math.max(0, scrollTop - maxPushed);
			const linesToJustScroll = linesToScroll - newLinesToPush;

			if (newLinesToPush > 0) {
				const pushBase = Math.max(lastScrollTop, maxPushed);
				operations.push({
					start: adjustedStart,
					end: adjustedEnd,
					linesToScroll: newLinesToPush,
					lines: getLinesForScroll(pushBase, newLinesToPush),
					direction: 'up',
					scrollToBackbuffer: true,
					regionId: region.id,
					newMaxPushed: Math.max(maxPushed, scrollTop),
				});
			}

			if (linesToJustScroll > 0) {
				const visualBase = lastScrollTop;
				operations.push({
					start: adjustedStart,
					end: adjustedEnd,
					linesToScroll: linesToJustScroll,
					lines: getLinesForScroll(visualBase, linesToJustScroll),
					direction: 'up',
					scrollToBackbuffer: false,
					regionId: region.id,
				});
			}
		} else {
			operations.push({
				start: adjustedStart,
				end: adjustedEnd,
				linesToScroll,
				lines: getLinesForScroll(
					direction === 'up' ? lastScrollTop : scrollTop,
					linesToScroll,
				),
				direction,
				scrollToBackbuffer: false,
				regionId: region.id,
			});

			if (
				direction === 'up' &&
				region.overflowToBackbuffer &&
				adjustedStart === 0 &&
				region.width === columns &&
				region.x === 0
			) {
				const newMaxPushed = Math.max(maxPushed, scrollTop);
				if (newMaxPushed !== maxPushed) {
					// We need to signal that maxPushed updated even if we didn't push to backbuffer here?
					// Wait, the original code did:
					// this.terminalWriter.maxRegionScrollTops.set(region.id, Math.max(maxPushed, scrollTop));
					// So I should track it.
					this.maxRegionScrollTops.set(region.id, newMaxPushed);
				}
			}
		}

		this.lastRegionScrollTops.set(region.id, scrollTop);
		return operations;
	}

	updateMaxPushed(regionId: string | number, maxPushed: number) {
		const current = this.maxRegionScrollTops.get(regionId) ?? 0;
		this.maxRegionScrollTops.set(regionId, Math.max(current, maxPushed));
	}

	resetTracking(regionId: string | number) {
		this.maxRegionScrollTops.delete(regionId);
		this.lastRegionScrollTops.delete(regionId);
	}
}
