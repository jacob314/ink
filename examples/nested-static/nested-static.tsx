/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React, {
	useState,
	useEffect,
	useReducer,
	useRef,
	useLayoutEffect,
} from 'react';
import {
	Box,
	Text,
	StaticRender,
	useInput,
	getInnerHeight,
	getScrollHeight,
	type DOMElement,
} from '../../src/index.js';

const renderCounts = new Map<string, number>();

function TrackedText({
	name,
	children,
	color,
}: {
	readonly name: string;
	readonly children: React.ReactNode;
	readonly color?: string;
}) {
	return (
		<Text color={color}>
			<ink-text
				internal_transform={text => {
					const count = (renderCounts.get(name) || 0) + 1;
					renderCounts.set(name, count);
					return `${text} [Rebuilt: ${count}]`;
				}}
			>
				{children}
			</ink-text>
		</Text>
	);
}

type ScrollState = {
	scrollTop: number;
};

type ScrollAction =
	| {type: 'up'; delta: number}
	| {type: 'down'; delta: number; max: number}
	| {type: 'setTop'; value: number};

function scrollReducer(state: ScrollState, action: ScrollAction): ScrollState {
	switch (action.type) {
		case 'up': {
			return {
				...state,
				scrollTop: Math.max(0, state.scrollTop - action.delta),
			};
		}

		case 'down': {
			return {
				...state,
				scrollTop: Math.min(state.scrollTop + action.delta, action.max),
			};
		}

		case 'setTop': {
			return {
				...state,
				scrollTop: action.value,
			};
		}
	}
}

export function useTerminalSize(): {columns: number; rows: number} {
	const [size, setSize] = useState({
		columns: process.stdout.columns || 80,
		rows: process.stdout.rows || 20,
	});

	useEffect(() => {
		const updateSize = () => {
			setSize({
				columns: process.stdout.columns || 80,
				rows: process.stdout.rows || 20,
			});
		};

		process.stdout.on('resize', updateSize);

		return () => {
			process.stdout.off('resize', updateSize);
		};
	}, []);

	return size;
}

const InnerStatic = React.memo(({id}: {readonly id: string}) => {
	return (
		<StaticRender width={50}>
			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor="yellow"
				paddingX={1}
			>
				<TrackedText name={`inner-${id}`} color="yellow">
					Inner Item {id}
				</TrackedText>
				<Text dimColor>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit.{'\n'}
					Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
					{'\n'}
					Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
					{'\n'}
					Nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in.
					{'\n'}
					Reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla.
				</Text>
			</Box>
		</StaticRender>
	);
});

const OuterGroup = React.memo(
	({groupId, items}: {readonly groupId: number; readonly items: number[]}) => {
		return (
			<StaticRender width={60}>
				<Box
					flexDirection="column"
					borderStyle="double"
					borderColor="blue"
					marginBottom={1}
					paddingX={1}
				>
					<TrackedText name={`outer-${groupId}`} color="cyan">
						Outer Group {groupId}
					</TrackedText>

					<Box flexDirection="column" gap={1} marginTop={1}>
						{items.map(itemId => (
							<InnerStatic
								key={`inner-${groupId}-${itemId}`}
								id={`${groupId}-${itemId}`}
							/>
						))}
					</Box>
				</Box>
			</StaticRender>
		);
	},
);

export default function NestedStaticDemo() {
	const [count, setCount] = useState(0);
	const [groups, setGroups] = useState<Array<{id: number; items: number[]}>>([
		{id: 1, items: Array.from({length: 1000}, (_, i) => i + 1)},
	]);
	const [scrollState, dispatch] = useReducer(scrollReducer, {scrollTop: 0});
	const {scrollTop} = scrollState;
	const {columns, rows} = useTerminalSize();

	const reference = useRef<DOMElement>(null);
	const sizeReference = useRef({innerHeight: 0, scrollHeight: 0});
	const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

	useLayoutEffect(() => {
		if (reference.current) {
			const innerHeight = getInnerHeight(reference.current);
			const scrollHeight = getScrollHeight(reference.current);

			sizeReference.current = {innerHeight, scrollHeight};

			if (shouldScrollToBottom) {
				dispatch({
					type: 'setTop',
					value: Math.max(0, scrollHeight - innerHeight),
				});
				setShouldScrollToBottom(false);
			}
		}
	});

	const [nextItemId, setNextItemId] = useState(1001);

	useInput((input, key) => {
		if (input === ' ') {
			setGroups(previousGroups => {
				const newGroups = [...previousGroups];
				const firstGroup = newGroups[0];
				if (firstGroup) {
					newGroups[0] = {
						...firstGroup,
						items: [...firstGroup.items, nextItemId],
					};
					setNextItemId(id => id + 1);
				}

				return newGroups;
			});
			setShouldScrollToBottom(true);
			return;
		}

		if (input === 'n') {
			setGroups(previousGroups => {
				const nextGroupId =
					previousGroups.length > 0
						? Math.max(...previousGroups.map(g => g.id)) + 1
						: 1;
				return [...previousGroups, {id: nextGroupId, items: [1]}];
			});
			setShouldScrollToBottom(true);
			return;
		}

		if (key.upArrow || input === 'w') {
			dispatch({type: 'up', delta: key.shift ? 10 : 1});
			return;
		}

		if (key.downArrow || input === 's') {
			dispatch({
				type: 'down',
				delta: key.shift ? 10 : 1,
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
			return;
		}

		if (input === 'u') {
			dispatch({
				type: 'up',
				delta: Math.floor(sizeReference.current.scrollHeight / 2),
			});
			return;
		}

		if (input === 'd') {
			dispatch({
				type: 'down',
				delta: Math.floor(sizeReference.current.scrollHeight / 2),
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
		}
	});

	useEffect(() => {
		const timer = setInterval(() => {
			setCount(previous => previous + 1);
		}, 1000);

		const addTimer = setInterval(() => {
			setGroups(previousGroups => {
				const newGroups = [...previousGroups];
				const firstGroup = newGroups[0];
				if (firstGroup) {
					newGroups[0] = {
						...firstGroup,
						items: [...firstGroup.items, nextItemId],
					};
					setNextItemId(id => id + 1);
				}

				return newGroups;
			});
			setShouldScrollToBottom(true);
		}, 200);

		return () => {
			clearInterval(timer);
			clearInterval(addTimer);
		};
	}, [nextItemId]);

	return (
		<Box flexDirection="column" height={rows} width={columns}>
			<Box flexDirection="column" height="100%" width="100%">
				<Box
					ref={reference}
					overflowToBackbuffer
					scrollbar
					flexDirection="column"
					flexGrow={1}
					flexShrink={1}
					overflowX="hidden"
					overflowY="scroll"
					paddingRight={0}
					scrollTop={scrollTop}
					width={columns}
				>
					{groups.map(group => (
						<OuterGroup
							key={`group-outer-${group.id}`}
							groupId={group.id}
							items={group.items}
						/>
					))}
				</Box>

				<Box
					borderTop
					borderStyle="single"
					flexDirection="column"
					flexShrink={0}
					overflow="hidden"
				>
					<Text color="green">Nested StaticRender Demo</Text>
					<Text>
						Press [Space] to add item to Group 1, [n] to add new Group.
					</Text>
					<Text>
						Arrows to scroll. [u]/[d] scroll up/down by half total height.
						ScrollTop: {scrollTop}
					</Text>
					<Text>Timer: {count}</Text>
				</Box>
			</Box>
		</Box>
	);
}
