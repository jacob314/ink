import EventEmitter from 'node:events';
import React from 'react';
import test from 'ava';
import {Box, Text, render, StaticRender} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';
import createStdin from './helpers/create-stdin.js';

const scenarios = [
	{
		name: 'sticky header should be visible when rendered inline within StaticRender',
		sticky: 'top' as const,
		scrollTop: 0,
		expectedLines: ['Inline Header'],
		unexpectedLines: ['Sticky Header'],
		content: (
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
		),
	},
	{
		name: 'sticky footer should be visible when rendered inline within StaticRender',
		sticky: 'bottom' as const,
		scrollTop: 0,
		expectedLines: ['Inline Footer'],
		unexpectedLines: ['Sticky Footer'],
		content: (
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
		),
	},
	{
		name: 'sticky header should be sticky when scrolled within StaticRender',
		sticky: 'top' as const,
		scrollTop: 5,
		expectedLines: ['Sticky Header'],
		unexpectedLines: ['Inline Header'],
		content: (
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
		),
	},
];

for (const {
	name,
	scrollTop,
	expectedLines,
	unexpectedLines,
	content,
} of scenarios) {
	test(name, t => {
		const stdin = createStdin();
		const stdout = createStdout();

		render(
			<Box flexDirection="column" height={10} width={20}>
				<Box
					flexDirection="column"
					overflowY="scroll"
					height={5}
					scrollTop={scrollTop}
				>
					<StaticRender width={20}>{() => content}</StaticRender>
				</Box>
			</Box>,
			{stdin, stdout, debug: true},
		);

		const output = stdout.get();
		const lines = output
			.split('\n')
			.map(l => l.trim())
			.filter(Boolean);

		for (const expected of expectedLines) {
			t.true(
				lines.some(l => l.includes(expected)),
				`Output should include "${expected}", but got lines:\n${lines.join('\n')}`,
			);
		}

		for (const unexpected of unexpectedLines) {
			t.false(
				lines.some(l => l.includes(unexpected)),
				`Output should NOT include "${unexpected}", but got lines:\n${lines.join('\n')}`,
			);
		}
	});
}
