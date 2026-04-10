import TerminalBuffer from '../src/terminal-buffer.js';
import {type Region, RegionNode} from '../src/output.js';
import {StyledLine} from '../src/styled-line.js';

const rows = 20;
const columns = 80;

const buffer = new TerminalBuffer(columns, rows, {renderInProcess: true});

// Create 1000 regions
const regions = new Map<string, Region>();

for (let i = 0; i < 1000; i++) {
	const region: Region = {
		id: `region-${i}`,
		x: 0,
		y: i,
		width: 50,
		height: 1,
		bufferWidth: 50,
		lines: Array.from({length: 10}, () => new StyledLine()),
		styledOutput: [],
		isScrollable: false,
		selectableSpans: [],
		stickyHeaders: [],
		children: [],
	};
	regions.set(region.id, region);
}

const rootRegion: Region = {
	id: 'root',
	x: 0,
	y: 0,
	width: columns,
	height: rows,
	bufferWidth: columns,
	lines: Array.from({length: rows}, () => new StyledLine()),
	styledOutput: [],
	isScrollable: false,
	selectableSpans: [],
	stickyHeaders: [],
	children: [...regions.values()].map(r => {
		// Mock inheritance simulating Object.create(region)
		return Object.create(r) as Region;
	}),
};

// Initial update
void buffer.update(0, 0, rootRegion, {row: 0, col: 0});
void buffer.fullRender();

const start = performance.now();
for (let i = 0; i < 100; i++) {
	void buffer.update(0, 0, rootRegion, {row: 0, col: 0});
	// Buffer.render(); // We just want to measure update
}

const end = performance.now();

console.log(
	`100 updates took ${(end - start).toFixed(2)}ms, average ${(end - start) / 100}ms per update`,
);
buffer.destroy();
