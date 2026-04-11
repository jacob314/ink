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
	const count = (renderCounts.get(name) || 0) + 1;
	renderCounts.set(name, count);

	return (
		<Text color={color}>
			{children} [Rebuilt: {count}]
		</Text>
	);
}

type ScrollState = {
	scrollTop: number;
};

type ScrollAction =
	| {type: 'up'; delta: number; max: number}
	| {type: 'down'; delta: number; max: number}
	| {type: 'setTop'; value: number};

function scrollReducer(state: ScrollState, action: ScrollAction): ScrollState {
	switch (action.type) {
		case 'up': {
			const currentScrollTop =
				state.scrollTop >= action.max ? action.max : state.scrollTop;
			return {
				...state,
				scrollTop: Math.max(0, currentScrollTop - action.delta),
			};
		}

		case 'down': {
			const currentScrollTop =
				state.scrollTop >= action.max ? action.max : state.scrollTop;
			const newScrollTop = currentScrollTop + action.delta;
			return {
				...state,
				scrollTop:
					newScrollTop >= action.max ? Number.MAX_SAFE_INTEGER : newScrollTop,
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
			{() => (
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
						Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
						eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
						ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
						aliquip ex ea commodo consequat. Duis aute irure dolor in
						reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla.
					</Text>
					{id === '1-1' && (
						<Box marginTop={1}>
							<StaticRender width={44}>
								{() => (
									<Box
										flexDirection="column"
										borderStyle="round"
										borderColor="green"
										paddingX={1}
									>
										<TrackedText name="nested-1" color="green">
											Nested Item 1
										</TrackedText>
										<TrackedText name="nested-2" color="green">
											Nested Item 2
										</TrackedText>
										<TrackedText name="nested-3" color="green">
											Nested Item 3
										</TrackedText>
									</Box>
								)}
							</StaticRender>
						</Box>
					)}
				</Box>
			)}
		</StaticRender>
	);
});

const OuterGroup = React.memo(
	({
		groupId,
		items,
		wrapInStatic,
	}: {
		readonly groupId: number;
		readonly items: number[];
		readonly wrapInStatic: boolean;
	}) => {
		const content = (
			<Box width={60} flexDirection="column" marginBottom={1} paddingX={1}>
				<Box flexDirection="column" gap={1} marginBottom={1}>
					{items.map(itemId => (
						<InnerStatic
							key={`inner-${groupId}-${itemId}`}
							id={`${groupId}-${itemId}`}
						/>
					))}
				</Box>

				<TrackedText name={`outer-${groupId}`} color="cyan">
					Outer Group {groupId}
				</TrackedText>
			</Box>
		);

		if (wrapInStatic) {
			return <StaticRender width={60}>{() => content}</StaticRender>;
		}

		return content;
	},
);

export default function NestedStaticDemo() {
	const [count, setCount] = useState(0);
	const [showTimer, setShowTimer] = useState(false);
	const [wrapFirstGroup, setWrapFirstGroup] = useState(true);
	const [autoAdd, setAutoAdd] = useState(false);
	const [groups, setGroups] = useState<Array<{id: number; items: number[]}>>([
		{id: 1, items: Array.from({length: 10_000}, (_, i) => i + 1)},
	]);
	const [scrollState, dispatch] = useReducer(scrollReducer, {
		scrollTop: Number.MAX_SAFE_INTEGER,
	});
	const {scrollTop} = scrollState;
	const {columns, rows} = useTerminalSize();

	const reference = useRef<DOMElement>(null);
	const sizeReference = useRef({innerHeight: 0, scrollHeight: 0});
	const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
	const isAtBottomReference = useRef(true);

	useLayoutEffect(() => {
		if (reference.current) {
			sizeReference.current.innerHeight = getInnerHeight(reference.current);
			sizeReference.current.scrollHeight = getScrollHeight(reference.current);

			if (shouldScrollToBottom) {
				dispatch({
					type: 'setTop',
					value: Number.MAX_SAFE_INTEGER,
				});
				setShouldScrollToBottom(false);
			}
		}
	});

	const [nextItemId, setNextItemId] = useState(10_001);

	const frameIndexReference = useRef(0);
	const frameTimesReference = useRef<number[]>([]);

	const now = Date.now();
	frameIndexReference.current++;
	frameTimesReference.current.push(now);
	while (
		frameTimesReference.current.length > 0 &&
		frameTimesReference.current[0]! < now - 1000
	) {
		frameTimesReference.current.shift();
	}

	const currentFps = frameTimesReference.current.length;

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
			if (isAtBottomReference.current) {
				setShouldScrollToBottom(true);
			}

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
			if (isAtBottomReference.current) {
				setShouldScrollToBottom(true);
			}

			return;
		}

		if (input === 'c') {
			setWrapFirstGroup(previous => !previous);
			return;
		}

		if (input === 'a') {
			setAutoAdd(previous => !previous);
			return;
		}

		if (key.upArrow || input === 'w') {
			dispatch({
				type: 'up',
				delta: key.shift ? 10 : 1,
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
			return;
		}

		if (key.downArrow) {
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
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
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
			return;
		}

		if (input === 't') {
			setShowTimer(previous => !previous);
		}
	});

	useEffect(() => {
		if (!showTimer) {
			return;
		}

		const timer = setInterval(() => {
			setCount(previous => previous + 1);
		}, 16);

		return () => {
			clearInterval(timer);
		};
	}, [showTimer]);

	useEffect(() => {
		if (!autoAdd) {
			return;
		}

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
			if (isAtBottomReference.current) {
				setShouldScrollToBottom(true);
			}
		}, 1000);

		return () => {
			clearInterval(addTimer);
		};
	}, [nextItemId, autoAdd]);

	return (
		<Box flexDirection="column" height={rows} width={columns}>
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
				<Box flexShrink={0} flexDirection="column">
					{groups.map(group => (
						<OuterGroup
							key={`group-outer-${group.id}`}
							groupId={group.id}
							items={group.items}
							wrapInStatic={group.id === 1 ? wrapFirstGroup : false}
						/>
					))}
				</Box>
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
					Press [Space] to add item to Group 1, [n] to add new Group, [c] to
					toggle static wrap for Group 1, [a] to toggle auto-add.
				</Text>
				<Text>
					Arrows to scroll. [u]/[d] scroll up/down by half total height.
					ScrollTop: {scrollTop}
				</Text>
				<Text>
					Timer: {count} | FPS: {currentFps} | Frame:{' '}
					{frameIndexReference.current} | G1 Static Wrap:{' '}
					{wrapFirstGroup ? 'ON' : 'OFF'} | Auto Add: {autoAdd ? 'ON' : 'OFF'}
				</Text>
			</Box>
		</Box>
	);
}
