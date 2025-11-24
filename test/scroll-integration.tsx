import {PassThrough} from 'node:stream';
import test from 'ava';
import React, {useState, useEffect} from 'react';
import xtermHeadless from '@xterm/headless';
import {render, Box, Text} from '../src/index.js';
import ScrollableContent from '../examples/scroll/scroll.js';

const {Terminal} = xtermHeadless;

const wait = async (ms: number) =>
	new Promise(resolve => setTimeout(resolve, ms));

const writeToTerm = async (term: any, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('simple rainbow verification', async t => {
	const columns = 20;
	const termRows = 5;

	const term = new Terminal({
		cols: columns,

		rows: termRows,
		allowProposedApi: true,
		convertEol: true,
	});

	const stdout = {
		columns,

		rows: termRows,
		write(chunk: string) {
			term.write(chunk);
			return true;
		},
		on() {},
		off() {},
		removeListener() {},
		end() {},
		isTTY: true,
	} as any;

	function SimpleComponent() {
		const [count, setCount] = useState(0);
		useEffect(() => {
			const timer = setInterval(() => {
				setCount(c => {
					if (c >= 5) {
						clearInterval(timer);
						return c;
					}

					return c + 1;
				});
			}, 100);
			return () => {
				clearInterval(timer);
			};
		}, []);

		return (
			<Box>
				<Text>Count: {count}</Text>
			</Box>
		);
	}

	const {unmount} = render(<SimpleComponent />, {
		stdout,
		debugRainbow: true,
		incrementalRendering: true,
		patchConsole: false,
	});

	await wait(1000);
	await writeToTerm(term, '');

	let foundBg = false;
	for (let i = 0; i < termRows; i++) {
		const line = term.buffer.active.getLine(i);
		if (line) {
			for (let j = 0; j < columns; j++) {
				const cell = line.getCell(j);
				if (cell && cell.getBgColor() !== -1) {
					foundBg = true;
					break;
				}
			}
		}

		if (foundBg) break;
	}

	t.true(foundBg, 'Should have some background colors from rainbow');
	unmount();
});

test('scroll integration - verify repaint efficiency', async t => {
	const columns = 100;
	const termRows = 40;

	const term = new Terminal({
		cols: columns,

		rows: termRows,
		allowProposedApi: true,
		convertEol: true,
	});

	const stdout = {
		columns,

		rows: termRows,
		write(chunk: string) {
			term.write(chunk);
			return true;
		},
		on() {},
		off() {},
		removeListener() {},
		end() {},
		isTTY: true,
	} as any;

	const stdin = new PassThrough() as any;
	stdin.isTTY = true;
	stdin.setRawMode = () => {};
	stdin.ref = () => {};
	stdin.unref = () => {};

	const {unmount} = render(
		<ScrollableContent
			columns={columns}
			rows={termRows}
			itemCount={50}
			useStatic={false}
		/>,
		{
			stdout,
			stdin,
			debugRainbow: true,
			incrementalRendering: true,
			patchConsole: false,
			renderProcess: false,
			terminalBuffer: true,
		},
	);

	const getFullContent = () => {
		return Array.from(
			{length: termRows},
			(_, i) => term.buffer.active.getLine(i)?.translateToString(true) || '',
		).join('\n');
	};

	const getLineBg = (y: number) => {
		const line = term.buffer.active.getLine(y);
		if (!line) return -2;
		for (let x = 0; x < columns; x++) {
			const cell = line.getCell(x);
			if (cell?.getChars().trim()) {
				return cell.getBgColor();
			}
		}

		return -1;
	};

	const getScrollHeightFromTerm = () => {
		for (let i = 0; i < termRows; i++) {
			const line = term.buffer.active.getLine(i)?.translateToString(true);
			const match = /inner\s*scrollable\s*size:\s*\d+\s*x\s*(\d+)/i.exec(
				line || '',
			);
			if (match) return Number.parseInt(match[1]!, 10);
		}

		return 0;
	};

	let scrollHeight = 0;
	for (let i = 0; i < 20; i++) {
		await wait(500);
		await writeToTerm(term, '');
		scrollHeight = getScrollHeightFromTerm();
		if (scrollHeight > 0) break;
	}

	t.true(scrollHeight > 0, 'Should have non-zero scrollHeight');

	let footerStartY = -1;
	for (let i = 0; i < termRows; i++) {
		const line = term.buffer.active.getLine(i)?.translateToString(true);
		if (line?.includes('demo showing a scrollable box')) {
			footerStartY = i;
			break;
		}
	}

	t.true(footerStartY > 0, 'Footer should be visible');

	const initialBgs = Array.from({length: termRows}, (_, i) => getLineBg(i));

	// Scroll down 1 line
	stdin.write('\u001B[B');
	await wait(1000);
	await writeToTerm(term, '');

	const scrolledBgs = Array.from({length: termRows}, (_, i) => getLineBg(i));

	const repaintedIndices = [];
	for (let i = 0; i < termRows; i++) {
		const line = term.buffer.active.getLine(i);
		if (
			line?.translateToString(true).trim() &&
			scrolledBgs[i] !== initialBgs[i]
		) {
			repaintedIndices.push(i);
		}
	}

	console.log(
		`Total repainted non-empty lines: ${repaintedIndices.length} / ${termRows}`,
	);

	const footerRepainted = repaintedIndices.filter(i => i >= footerStartY);
	console.log(`Footer lines repainted: ${footerRepainted.length}`);

	// Before the fix, this was 22. Now it should be very low (0 or 1 depending on whether ScrollTop status line is in footer).
	t.true(
		footerRepainted.length <= 2,
		'Footer should not be repainted excessively during scroll',
	);
	t.true(
		repaintedIndices.length < termRows / 2,
		'Should not repaint the whole screen for a 1-line scroll',
	);

	// Scroll back up
	stdin.write('\u001B[A');
	// Wait longer for scroll up to process and render
	await wait(2000);
	await writeToTerm(term, '');

	const finalContent = getFullContent();
	console.log(
		'Final content after scroll up:',
		finalContent.replaceAll(/\s+/g, ' '),
	);
	t.true(
		finalContent.includes('ScrollTop: 0'),
		'Should be back at ScrollTop 0',
	);

	// Scroll to bottom
	stdin.write('b');
	await wait(2000);
	await writeToTerm(term, '');

	const bottomContent = getFullContent();
	t.true(
		bottomContent.includes('ScrollTop: 710'),
		'Should have scrolled to the bottom area',
	);

	unmount();
});
