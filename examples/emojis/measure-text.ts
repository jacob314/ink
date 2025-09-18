
import defaultStringWidth from 'string-width';
import pkg from '@xterm/headless';

const {Terminal} = pkg;

const term = new Terminal({
	allowProposedApi: true,
	rows: 80,
	cols: 20
});


const SAVE_CURSOR_POSITION = '\u001B[s';
const RESTORE_CURSOR_POSITION = '\u001B[u';
const CLEAR_LINE = '\u001B[K';
const REQUEST_CURSOR_POSITION = '\u001B[6n';

class MeasurementEngine {
	private queue: {s: string; resolve: (width: number) => void}[] = [];
	private isMeasuring = false;
	private buffer = '';
	private currentItem: {s: string; resolve: (width: number) => void} | null = null;

	constructor() {
		process.stdin.on('data', this.onData.bind(this));
	}

	measure(s: string): Promise<number> {
		return new Promise(resolve => {
			this.queue.push({s, resolve});
			this.processQueue();
		});
	}

	private processQueue() {
		if (this.isMeasuring || this.queue.length === 0) {
			return;
		}

		this.isMeasuring = true;
		this.currentItem = this.queue.shift()!;

		let command = SAVE_CURSOR_POSITION;
		command += `\u001B[${process.stdout.rows};1H`; // Move to last line
		command += '\u001B[8m'; // Make text invisible
		command += this.currentItem.s;
		command += '\u001B[28m'; // Make text visible again
		command += REQUEST_CURSOR_POSITION;

		process.stdout.write(command);
	}

	private onData(data: Buffer) {
		this.buffer += data.toString();

		if (!this.isMeasuring || !this.currentItem) {
			return;
		}

		const reportMatch = this.buffer.match(/\u001B\[\d+;(\d+)R/);

		if (reportMatch) {
			const column = parseInt(reportMatch[1], 10);
			const width = column - 1;

			this.currentItem.resolve(width);
			this.currentItem = null;

			this.buffer = this.buffer.slice(reportMatch.index! + reportMatch[0].length);

			this.isMeasuring = false;

			let cleanupCommand = `\u001B[${process.stdout.rows};1H`;
			cleanupCommand += ' '.repeat(width);
			cleanupCommand += RESTORE_CURSOR_POSITION;

			process.stdout.write(cleanupCommand);
			this.processQueue();
		}
	}
}

let measurementEngine: MeasurementEngine;

export const measureText = (s: string) => {
	if (!measurementEngine) {
		measurementEngine = new MeasurementEngine();
	}
	return measurementEngine.measure(s);
}

const widthCache = new Map<string, number>();
const measuredWidths = new Map<string, number>();
const toMeasure = new Set<string>();

export const createStringWidth = (rerender: () => void) => {
	const scheduleMeasure = () => {
		setTimeout(async () => {
			const stringsToMeasure = Array.from(toMeasure);
			if (stringsToMeasure.length === 0) {
				return;
			}

			toMeasure.clear();

			for (const s of stringsToMeasure) {
				const width = await measureText(s);
				measuredWidths.set(s, width);
			}

			rerender();
		}, 100);
	};

	return (s: string) => {
		if (widthCache.has(s)) {
			return widthCache.get(s)!;
		}
		if (measuredWidths.has(s)) {
			return measuredWidths.get(s)!;
		}

		const xtermWidth = (term as any)._core.unicodeService.getStringCellWidth(s);
		const requiresMeasurement = /\p{Extended_Pictographic}/u.test(s);
		if (!requiresMeasurement) {
			widthCache.set(s, xtermWidth);
			return xtermWidth;
		}

		if (toMeasure.size === 0) {
			scheduleMeasure();
		}
		toMeasure.add(s);
		return xtermWidth;
	}
};
