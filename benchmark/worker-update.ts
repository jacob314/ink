import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import {
	type RegionNode,
	type Region,
	type RegionUpdate,
} from '../src/output.js';
import {StyledLine} from '../src/styled-line.js';

const rows = 20;
const columns = 80;

const worker = new TerminalBufferWorker(columns, rows);

// Create 1000 regions
const regions = new Map<string, Region>();
const updates: RegionUpdate[] = [];

for (let i = 0; i < 1000; i++) {
	const region: Region = {
		id: `region-${i}`,
		x: 0,
		y: i,
		width: 50,
		height: 1,
		bufferWidth: 50,
		lines: [new StyledLine()],
		styledOutput: [],
		isScrollable: false,
		selectableSpans: [],
		stickyHeaders: [],
		children: [],
	};
	regions.set(region.id, region);
	updates.push({
		id: region.id,
		x: region.x,
		y: region.y,
		width: region.width,
		height: region.height,
		lines: {
			updates: [{start: 0, end: 1, data: new Uint8Array()}],
			totalLength: 1,
		},
		stickyHeaders: [],
	});
}

const root: RegionNode = {
	id: 'root',
	children: [...regions.values()].map(r => ({id: r.id, children: []})),
};

// Initial update
worker.update(root, updates, {row: 0, col: 0});
void worker.fullRender();

const start = performance.now();
for (let i = 0; i < 100; i++) {
	worker.update(root, updates, {row: 0, col: 0});
	void worker.render();
}

const end = performance.now();

console.log(
	`100 updates took ${(end - start).toFixed(2)}ms, average ${(end - start) / 100}ms per update`,
);
