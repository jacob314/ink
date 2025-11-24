import {type Region} from '../output.js';

export type AnimationOptions = {
	interval: number;
	onTick: () => void;
};

/**
 * Manages scroll animations.
 * Interpolates between current scroll position and target scroll position.
 */
export class AnimationController {
	private readonly targetScrollTops = new Map<string | number, number>();
	private intervalId?: NodeJS.Timeout;

	constructor(private readonly options: AnimationOptions) {}

	/**
	 * Returns the internal target scroll tops map.
	 */
	get allTargetScrollTops(): ReadonlyMap<string | number, number> {
		return this.targetScrollTops;
	}

	/**
	 * Sets the target scroll position for a region.
	 */
	setTargetScrollTop(regionId: string | number, scrollTop: number) {
		this.targetScrollTops.set(regionId, scrollTop);
	}

	/**
	 * Returns the target scroll top for a region.
	 */
	getTargetScrollTop(regionId: string | number): number | undefined {
		return this.targetScrollTops.get(regionId);
	}

	/**
	 * Starts the animation loop if not already running.
	 */
	start() {
		if (this.intervalId) {
			return;
		}

		this.intervalId = setInterval(() => {
			this.tick();
		}, this.options.interval);
	}

	/**
	 * Stops the animation loop.
	 */
	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
	}

	/**
	 * Interrupts animations and jumps all regions to their targets.
	 */
	jumpToTargets(regions: Map<string | number, Region>) {
		for (const [id, target] of this.targetScrollTops) {
			const region = regions.get(id);
			if (region) {
				region.scrollTop = target;
			}
		}

		this.stop();
	}

	/**
	 * Updates regions based on their targets. Returns true if any region scrolled.
	 */
	updateRegions(regions: Map<string | number, Region>): {
		hasScrolled: boolean;
		canScrollMore: boolean;
	} {
		let hasScrolled = false;
		let canScrollMore = false;

		for (const region of regions.values()) {
			const target = this.targetScrollTops.get(region.id);
			if (target === undefined) {
				continue;
			}

			const current = region.scrollTop ?? 0;

			if (current !== target) {
				region.scrollTop = current < target ? current + 1 : current - 1;

				hasScrolled = true;
				canScrollMore = true;
			}
		}

		return {hasScrolled, canScrollMore};
	}

	/**
	 * Processes one frame of animation.
	 */
	private tick() {
		this.options.onTick();
	}
}
