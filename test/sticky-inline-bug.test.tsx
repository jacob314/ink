import EventEmitter from 'node:events';
import React from 'react';
import test from 'ava';
import {Box, Text, render, StaticRender} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

const createStdin = (): NodeJS.ReadStream => {
	const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
	stdin.setRawMode = () => stdin;
	stdin.setEncoding = () => stdin;
	stdin.resume = () => stdin;
	stdin.pause = () => stdin;
	stdin.isTTY = true;
	stdin.isRaw = false;
	stdin.read = () => null;
	return stdin;
};

test('sticky header should be visible when rendered inline within StaticRender', t => {
	const stdin = createStdin();
	const stdout = createStdout();

	render(
		<Box flexDirection="column" height={10} width={20}>
			<Box flexDirection="column" overflowY="scroll" height={5} scrollTop={0}>
				<StaticRender width={20}>
					<Box flexDirection="column">
						<Box
							sticky
							stickyChildren={
								<Box>
									<Text>Sticky Header</Text>
								</Box>
							}
						>
							<Box>
								<Text>Inline Header</Text>
							</Box>
						</Box>
						<Box height={2}>
							<Text>Spacing</Text>
						</Box>
					</Box>
				</StaticRender>
			</Box>
		</Box>,
		{stdin, stdout, debug: true},
	);

	const output = stdout.get();
	// Split by newline and filter empty lines to see what we actually got
	const lines = output
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);

	t.true(
		lines.some(l => l.includes('Inline Header')),
		`Output should include "Inline Header", but got lines:\n${lines.join('\n')}`,
	);
	t.false(
		lines.some(l => l.includes('Sticky Header')),
		`Output should NOT include "Sticky Header" when inline, but got lines:\n${lines.join('\n')}`,
	);
});

test('sticky footer should be visible when rendered inline within StaticRender', t => {
	const stdin = createStdin();
	const stdout = createStdout();

	render(
		<Box flexDirection="column" height={10} width={20}>
			<Box flexDirection="column" overflowY="scroll" height={5} scrollTop={0}>
				<StaticRender width={20}>
					<Box flexDirection="column">
						<Box height={2}>
							<Text>Content Top</Text>
						</Box>
						<Box
							sticky="bottom"
							stickyChildren={
								<Box>
									<Text>Sticky Footer</Text>
								</Box>
							}
						>
							<Box>
								<Text>Inline Footer</Text>
							</Box>
						</Box>
					</Box>
				</StaticRender>
			</Box>
		</Box>,
		{stdin, stdout, debug: true},
	);

	const output = stdout.get();
	const lines = output
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);

	t.true(
		lines.some(l => l.includes('Inline Footer')),
		`Output should include "Inline Footer", but got lines:\n${lines.join('\n')}`,
	);
	t.false(
		lines.some(l => l.includes('Sticky Footer')),
		`Output should NOT include "Sticky Footer" when inline, but got lines:\n${lines.join('\n')}`,
	);
});

test('sticky header should be sticky when scrolled within StaticRender', t => {
	const stdin = createStdin();
	const stdout = createStdout();

	render(
		<Box flexDirection="column" height={10} width={20}>
			<Box flexDirection="column" overflowY="scroll" height={5} scrollTop={5}>
				<StaticRender width={20}>
					<Box flexDirection="column">
						<Box
							sticky
							stickyChildren={
								<Box>
									<Text>Sticky Header</Text>
								</Box>
							}
						>
							<Box>
								<Text>Inline Header</Text>
							</Box>
						</Box>
						<Box height={10}>
							<Text>Content</Text>
						</Box>
					</Box>
				</StaticRender>
			</Box>
		</Box>,
		{stdin, stdout, debug: true},
	);

	const output = stdout.get();
	const lines = output
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);

	t.true(
		lines.some(l => l.includes('Sticky Header')),
		`Output should include "Sticky Header" when stuck, but got lines:\n${lines.join('\n')}`,
	);
	t.false(
		lines.some(l => l.includes('Inline Header')),
		`Output should NOT include "Inline Header" when it has scrolled past, but got lines:\n${lines.join('\n')}`,
	);
});
