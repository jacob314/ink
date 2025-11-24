import {Buffer} from 'node:buffer';
import {type RegionNode, type RegionUpdate, type Region} from '../output.js';
import {Deserializer} from '../serialization.js';

/**
 * Manages the scene tree of regions.
 * Handles updates from the main thread and maintains the current state of all regions.
 */
export class SceneManager {
	regions = new Map<string | number, Region>();
	root?: RegionNode;
	regionWasAtEnd = new Map<string | number, boolean>();

	/**
	 * Updates the scene tree and regions with new data.
	 * Returns true if the scene was updated in a way that likely requires a re-render.
	 */
	update(
		tree: RegionNode,
		updates: RegionUpdate[],
		options: {
			animatedScroll: boolean;
			onScrollUpdate: (
				regionId: string | number,
				scrollTop: number,
				isNew: boolean,
			) => void;
		},
	): boolean {
		this.root = tree;

		for (const update of updates) {
			let region = this.regions.get(update.id);
			const isNew = !region;

			if (region) {
				// We'll let the caller handle the animation logic, but we track if it was at the end.
				// This is used for scrollbar thumb calculation during animations.
				// Actually, the current logic in render-worker.ts does this:
				// const currentEffectiveScrollTop = this.targetScrollTops.get(region.id) ?? region.scrollTop ?? 0;
				// const wasAtEnd = currentEffectiveScrollTop >= (region.scrollHeight ?? 0) - (region.height ?? 0);
				// this.regionWasAtEnd.set(region.id, wasAtEnd);
				// I'll keep regionWasAtEnd in SceneManager but the 'currentEffectiveScrollTop'
				// might need to be passed in or handled by the caller.
			} else {
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
				this.regionWasAtEnd.set(update.id, true);
			}

			// Apply properties
			if (update.x !== undefined) region.x = update.x;
			if (update.y !== undefined) region.y = update.y;
			if (update.width !== undefined) region.width = update.width;
			if (update.height !== undefined) region.height = update.height;

			if (update.scrollTop !== undefined) {
				options.onScrollUpdate(region.id, update.scrollTop, isNew);
			}

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

		return updates.length > 0;
	}

	getRegion(id: string | number): Region | undefined {
		return this.regions.get(id);
	}

	getRootRegion(): Region | undefined {
		return this.root ? this.regions.get(this.root.id) : undefined;
	}
}
