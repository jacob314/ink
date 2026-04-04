import test from 'ava';
import {TerminalBufferWorker} from '../src/worker/render-worker.js';
import xtermHeadless from '@xterm/headless';
import {Serializer} from '../src/serialization.js';
import {createStyledLine} from './helpers/replay-lib.js';

const {Terminal} = xtermHeadless;

test('TerminalBufferWorker generates correct backbuffer during scroll', async t => {
	const columns = 80;
	const rows = 10;
	let output = '';
	const stdout = {
		write(chunk: string) {
			output += chunk;
			return true;
		},
		on() {},
		rows,
		columns,
	} as unknown as NodeJS.WriteStream;

	const worker = new TerminalBufferWorker(columns, rows, {stdout});
	const serializer = new Serializer();
	
	// Create lines 0 to 50
	const lines = Array.from({length: 50}, (_, i) => createStyledLine(`Line ${i}`));
	const data = serializer.serialize(lines);

	// First render (scrollTop 0)
	worker.update({
		id: 'root',
		children: [{id: 'scroll', children: []}]
	}, [
		{
			id: 'root',
			y: 0,
			width: columns,
			height: rows,
			lines: {updates: [], totalLength: 0}
		},
		{
			id: 'scroll',
			y: 0,
			width: columns,
			height: rows,
			isScrollable: true,
			overflowToBackbuffer: true,
			scrollTop: 0,
			scrollHeight: 50,
			scrollWidth: columns,
			lines: {
				updates: [{start: 0, end: 50, data}],
				totalLength: 50
			}
		}
	]);

	await worker.render();

	// Scroll to bottom
	worker.update({
		id: 'root',
		children: [{id: 'scroll', children: []}]
	}, [
		{
			id: 'scroll',
			scrollTop: 40
		}
	]);

	await worker.render();

	const term = new Terminal({cols: columns, rows, allowProposedApi: true, convertEol: true});
	await new Promise<void>((resolve) => term.write(output, resolve));
	
	// Expect the backbuffer to have lines 0 to 39
	// And the screen to have lines 40 to 49
	t.is(term.buffer.active.getLine(0)?.translateToString(true).trim(), 'Line 0');
    t.is(term.buffer.active.getLine(39)?.translateToString(true).trim(), 'Line 39');
    t.is(term.buffer.active.getLine(40)?.translateToString(true).trim(), 'Line 40');
});
