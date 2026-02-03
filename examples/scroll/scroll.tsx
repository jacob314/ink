/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React, {
	useState,
	useReducer,
	useRef,
	useEffect,
	useLayoutEffect,
	useMemo,
	useContext,
} from 'react';
import {
	Box,
	Text,
	useInput,
	getInnerHeight,
	getInnerWidth,
	getScrollHeight,
	getScrollWidth,
	getVerticalScrollbarBoundingBox,
	type DOMElement,
	type ScrollbarBoundingBox,
	StaticRender,
	AppContext,
} from '../../src/index.js';
import {debugLog} from '../../src/debug-log.js';

type ScrollMode = 'vertical' | 'horizontal' | 'both' | 'hidden';

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

const scrollModes: ScrollMode[] = ['vertical', 'horizontal', 'both', 'hidden'];

type ScrollState = {
	scrollTop: number;
	scrollLeft: number;
};

type ScrollAction =
	| {type: 'up'; delta: number}
	| {type: 'down'; delta: number; max: number}
	| {type: 'left'; delta: number}
	| {type: 'right'; delta: number; max: number}
	| {type: 'setTop'; value: number}
	| {type: 'setLeft'; value: number}
	| {type: 'bottom'; max: number};

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

		case 'left': {
			return {
				...state,
				scrollLeft: Math.max(0, state.scrollLeft - action.delta),
			};
		}

		case 'right': {
			return {
				...state,
				scrollLeft: Math.min(state.scrollLeft + action.delta, action.max),
			};
		}

		case 'setTop': {
			return {
				...state,
				scrollTop: action.value,
			};
		}

		case 'setLeft': {
			return {
				...state,
				scrollLeft: action.value,
			};
		}

		case 'bottom': {
			return {
				...state,
				scrollTop: action.max,
			};
		}
	}
}

function ScrollableContent({
	columns: customColumns,
	rows: customRows,
	itemCount = 1000,
	useStatic: customUseStatic = false,
}: {
	readonly columns?: number;
	readonly rows?: number;
	readonly itemCount?: number;
	readonly useStatic?: boolean;
} = {}) {
	const useStatic = true; /// customUseStatic;

	const items = useMemo(() => {
		return Array.from({length: itemCount}).map((_, i) => {
			const lineCount = (i % 8) + 3; // 3 to 10 lines
			const hasYellowText = i % 3 === 0;

			const lines = Array.from({length: lineCount}).map((_, index) => {
				if (index === 0 && hasYellowText) {
					return {
						id: `${i}-${index}`,
						text: `This is the first line of box ${i} with yellow text.`,
						color: 'yellow',
					};
				}

				if (index === 0) {
					return {
						id: `${i}-${index}`,
						text: `This is the first line of box ${i}`,
						color: 'blue',
					};
				}

				return {
					id: `${i}-${index}`,
					text: `${index} This is line in a line in a box. This is some text that is long enough to require some word wrapping.`,
				};
			});

			return {
				id: i,
				lines,
			};
		});
	}, [itemCount]);

	const [scrollMode, setScrollMode] = useState<ScrollMode>('vertical');
	const [scrollState, dispatch] = useReducer(scrollReducer, {
		scrollTop: 0,
		scrollLeft: 0,
	});
	const {scrollTop, scrollLeft} = scrollState;
	const [verticalScrollbar, setVerticalScrollbar] = useState<
		ScrollbarBoundingBox | undefined
	>(undefined);
	const [showScrollbars, setShowScrollbars] = useState(true);
	const {options, setOptions} = useContext(AppContext);
	const reference = useRef<DOMElement>(null);
	const {columns: terminalColumns, rows: terminalRows} = useTerminalSize();
	const columns = customColumns ?? terminalColumns;
	const termRows = customRows ?? terminalRows;

	const [size, setSize] = useState({
		innerHeight: 0,
		scrollHeight: 0,
		innerWidth: 0,
		scrollWidth: 0,
	});

	const sizeReference = useRef(size);
	useEffect(() => {
		sizeReference.current = size;
	}, [size]);

	const scrollIntervalReference = useRef<NodeJS.Timeout | undefined>(null);

	useEffect(() => {
		return () => {
			if (scrollIntervalReference.current) {
				clearInterval(scrollIntervalReference.current);
			}
		};
	}, []);

	useLayoutEffect(() => {
		if (reference.current) {
			const innerHeight = getInnerHeight(reference.current);
			const innerWidth = getInnerWidth(reference.current);
			const scrollHeight = getScrollHeight(reference.current);
			const scrollWidth = getScrollWidth(reference.current);
			const currentVerticalScrollbar = getVerticalScrollbarBoundingBox(
				reference.current,
			);

			if (
				size.innerHeight !== innerHeight ||
				size.scrollHeight !== scrollHeight ||
				size.innerWidth !== innerWidth ||
				size.scrollWidth !== scrollWidth
			) {
				setSize({innerHeight, scrollHeight, innerWidth, scrollWidth});
			}

			debugLog(
				'XXX scrollHeight:' + scrollHeight + ' innerHeight:' + innerHeight,
			);
			if (scrollTop === Number.MAX_SAFE_INTEGER) {
				dispatch({
					type: 'setTop',
					value: Math.max(0, scrollHeight - innerHeight),
				});
			}

			if (
				JSON.stringify(currentVerticalScrollbar) !==
				JSON.stringify(verticalScrollbar)
			) {
				setVerticalScrollbar(currentVerticalScrollbar);
			}
		}
	});

	useInput((input, key) => {
		if (input === 'b') {
			dispatch({
				type: 'bottom',
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
			return;
		}

		if (input === 'm') {
			setScrollMode(previousMode => {
				const currentIndex = scrollModes.indexOf(previousMode);
				const nextIndex = (currentIndex + 1) % scrollModes.length;
				return scrollModes[nextIndex]!;
			});
			return;
		}

		if (input === 's') {
			setShowScrollbars(previous => !previous);
			return;
		}

		if (input === 'f' || input === 'a') {
			const enabled = !options?.isAlternateBufferEnabled;
			setOptions({
				isAlternateBufferEnabled: enabled,
				stickyHeadersInBackbuffer: enabled,
			});
			return;
		}

		if (input === 'h') {
			setOptions({
				stickyHeadersInBackbuffer: !options?.stickyHeadersInBackbuffer,
			});
			return;
		}

		if (!key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
			return;
		}

		if (scrollIntervalReference.current) {
			clearInterval(scrollIntervalReference.current);
		}

		const scroll = ({
			type,
			getDelta,
			getMax,
			frames = 5,
			interval = 1,
		}: {
			type: 'left' | 'right';
			getDelta: () => number;
			getMax: () => number;
			frames?: number;
			interval?: number;
		}) => {
			let frame = 0;
			scrollIntervalReference.current = setInterval(() => {
				if (frame < frames) {
					if (type === 'left') {
						dispatch({type: 'left', delta: getDelta()});
					} else {
						dispatch({type: 'right', delta: getDelta(), max: getMax()});
					}

					frame++;
				} else if (scrollIntervalReference.current) {
					clearInterval(scrollIntervalReference.current);
					scrollIntervalReference.current = null;
				}
			}, interval);
		};

		if (key.upArrow) {
			const delta = key.shift ? 10 : 1;
			dispatch({type: 'up', delta});
		}

		if (key.downArrow) {
			const delta = key.shift ? 10 : 1;
			dispatch({
				type: 'down',
				delta,
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
		}

		if (key.leftArrow) {
			scroll({
				type: 'left',
				getDelta: () => 1,
				getMax: () => 0,
			});
		}

		if (key.rightArrow) {
			scroll({
				type: 'right',
				getDelta: () => 1,
				getMax: () =>
					Math.max(
						0,
						sizeReference.current.scrollWidth -
							sizeReference.current.innerWidth,
					),
			});
		}
	});

	const overflowX =
		scrollMode === 'horizontal' || scrollMode === 'both' ? 'scroll' : 'hidden';
	const overflowY =
		scrollMode === 'vertical' || scrollMode === 'both' ? 'scroll' : 'hidden';

	const staticContent = useMemo(() => {
		const children = items.map(item => (
			<Box
				key={item.id}
				flexDirection="column"
				borderStyle="round"
				width={columns - 2}
				marginBottom={1}
			>
				{item.lines.map((line, index) => (
					<Box
						key={line.id}
						sticky={index === 0}
						opaque={index === 0}
						width="100%"
					>
						<Text color={line.color}>{line.text}</Text>
					</Box>
				))}
			</Box>
		));

		if (useStatic) {
			return (
				<StaticRender key={`my-static-render-${columns}`} width={columns - 2}>
					<Text>START OF STATIC BLOCK</Text>
					{children}
				</StaticRender>
			);
		}

		return (
			<Box key="my-static-render" width={columns - 2} flexDirection="column">
				{children}
			</Box>
		);
	}, [columns, items, useStatic]);

	return (
		<Box flexDirection="column" height={termRows} width={columns}>
			<Box
				ref={reference}
				overflowToBackbuffer
				flexShrink={1}
				width={columns}
				flexDirection="column"
				overflowX={overflowX}
				overflowY={overflowY}
				paddingRight={1}
				scrollTop={scrollTop}
				scrollLeft={scrollLeft}
				scrollbar={showScrollbars}
			>
				<Box
					flexDirection="column"
					flexShrink={0}
					width={
						scrollMode === 'horizontal' || scrollMode === 'both' ? 120 : 'auto'
					}
				>
					{staticContent}
					<Text key="last-line" color="yellow">
						This is the last line.
					</Text>
				</Box>
			</Box>
			<Box flexDirection="column" flexShrink={0} overflow="hidden">
				<Text>This is a demo showing a scrollable box.</Text>
				<Text>Press up/down arrow to scroll vertically.</Text>
				<Text>Press left/right arrow to scroll horizontally.</Text>
				<Text>Press 'b' to scroll to the bottom.</Text>
				<Text>
					Press 'm' to cycle through scroll modes (current: {scrollMode})
				</Text>
				<Text>
					Press 's' to toggle scrollbars (current:{' '}
					{showScrollbars ? 'on' : 'off'})
				</Text>
				<Text>
					Press 'a' or 'f' to toggle alternate buffer + sticky headers (current:{' '}
					{options?.isAlternateBufferEnabled ? 'on' : 'off'})
				</Text>
				<Text>
					Press 'h' to toggle sticky headers in backbuffer (current:{' '}
					{options?.stickyHeadersInBackbuffer ? 'on' : 'off'})
				</Text>
				<Text>ScrollTop: {scrollTop}</Text>
				<Text>ScrollLeft: {scrollLeft}</Text>
				<Text>
					Size: {size.innerWidth}x{size.innerHeight}
				</Text>
				<Text>
					Inner scrollable size: {size.scrollWidth}x{size.scrollHeight}
				</Text>
				{verticalScrollbar && (
					<Text>
						VScroll: x={verticalScrollbar.x}, y={verticalScrollbar.y}, h=
						{verticalScrollbar.height}, thumb=[{verticalScrollbar.thumb.start},{' '}
						{verticalScrollbar.thumb.end}]
					</Text>
				)}
				{!verticalScrollbar && <Text>No vertical scrollbar</Text>}
			</Box>
		</Box>
	);
}

export default ScrollableContent;
