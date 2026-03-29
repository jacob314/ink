import {PassThrough} from 'node:stream';
import test from 'ava';
import React, {useState, useEffect} from 'react';
import xtermHeadless from '@xterm/headless';
import {render, Box, Text} from '../src/index.js';
import ScrollableContent from '../examples/scroll/scroll.js';
import {waitFor} from './helpers/wait-for.js';

const {Terminal} = xtermHeadless;
const writeToTerm = async (term: any, data: string): Promise<void> =>
	new Promise(resolve => {
		term.write(data, () => {
			resolve();
		});
	});

test('scroll integration - verify repaint efficiency', async t => {
	t.timeout(30_000);
	const columns = 100;
	const termRows = 40;

	const term = new Terminal({
		cols: columns,

		rows: termRows,
		allowProposedApi: true,
		convertEol: true,
	});

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			stdout,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
			(_, i) => term.buffer.active.getLine(i)?.translateToString(true) ?? '',
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
				line ?? '',
			);
			if (match) return Number.parseInt(match[1]!, 10);
		}

		return 0;
	};

	await waitFor(async () => {
		await writeToTerm(term, '');
		return getScrollHeightFromTerm() > 0;
	}, 10_000);

	const scrollHeight = getScrollHeightFromTerm();

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
	await waitFor(async () => {
		await writeToTerm(term, '');
		return getFullContent().includes('ScrollTop: 1');
	}, 5000);
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

	const footerRepainted = repaintedIndices.filter(i => i >= footerStartY);

	// Before the fix, this was 22. Now it should be very low (3 or less depending on whether ScrollTop status line and scrollbar line are in footer).
	t.true(
		footerRepainted.length <= 3,
		`Footer should not be repainted excessively during scroll (got ${footerRepainted.length} repaints, expected <= 3)`,
	);
	t.true(
		repaintedIndices.length < termRows / 2,
		'Should not repaint the whole screen for a 1-line scroll',
	);

	// Scroll back up

	stdin.write('\u001B[A');
	// Wait longer for scroll up to process and render
	await waitFor(async () => {
		await writeToTerm(term, '');
		return getFullContent().includes('ScrollTop: 0');
	}, 5000);

	const finalContent = getFullContent();
	t.true(
		finalContent.includes('ScrollTop: 0'),
		'Should be back at ScrollTop 0',
	);

	// Scroll to bottom

	stdin.write('b');
	await waitFor(async () => {
		await writeToTerm(term, '');
		return getFullContent().includes('ScrollTop: 716');
	}, 10_000);

	const bottomContent = getFullContent();
	t.true(
		bottomContent.includes('ScrollTop: 716'),
		'Should have scrolled to the bottom area',
	);

	unmount();
});
