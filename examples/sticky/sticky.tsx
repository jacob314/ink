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
	useStdout,
	getInnerHeight,
	getScrollHeight,
	getAddedScrollHeight,
	type DOMElement,
	StaticRender,
	AppContext,
} from '../../src/index.js';

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

function ScrollableContent({
	useStatic = false,
}: {readonly useStatic?: boolean} = {}) {
	const [listItems, setListItems] = useState<Array<{id: number; text: string}>>(
		[],
	);
	const [showBorder, setShowBorder] = useState(false);
	const [showScrollbar, setShowScrollbar] = useState(true);
	const [stableScrollback, setStableScrollback] = useState(true);
	const [isFooterExpanded, setIsFooterExpanded] = useState(true);
	const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
	const [scrollState, dispatch] = useReducer(scrollReducer, {scrollTop: 0});
	const {scrollTop} = scrollState;
	const {columns: terminalColumns, rows: terminalRows} = useTerminalSize();
	const {stdout} = useStdout();
	const columns = (stdout as any)?.columns ?? terminalColumns;
	const rows = (stdout as any)?.rows ?? terminalRows;
	const reference = useRef<DOMElement>(null);
	const {options, setOptions} = useContext(AppContext);

	const [size, setSize] = useState({
		innerHeight: 0,
		scrollHeight: 0,
		addedScrollHeight: 0,
	});

	const sizeReference = useRef(size);
	useEffect(() => {
		sizeReference.current = size;
	}, [size]);

	useLayoutEffect(() => {
		if (reference.current) {
			const innerHeight = getInnerHeight(reference.current);
			const scrollHeight = getScrollHeight(reference.current);
			const addedScrollHeight = getAddedScrollHeight(reference.current);

			if (
				size.innerHeight !== innerHeight ||
				size.scrollHeight !== scrollHeight ||
				size.addedScrollHeight !== addedScrollHeight
			) {
				setSize({innerHeight, scrollHeight, addedScrollHeight});

				if (shouldScrollToBottom) {
					dispatch({
						type: 'setTop',
						value: Math.max(0, scrollHeight - innerHeight),
					});
					setShouldScrollToBottom(false);
				}
			}
		}
	});

	const boxWidth = columns;
	const contentWidth = showBorder ? boxWidth - 2 : boxWidth;

	const staticContent = useMemo(() => {
		const elements = [];
		for (let i = 0; i < listItems.length; i += 20) {
			const headerIndex = i;
			const headerId = headerIndex / 20;
			const headerText = `Header ${headerId}`;
			const stickyHeaderText = `Header ${headerId} (sticky top)`;
			const stickyFooterText = `Footer ${headerId} (sticky bottom)`;

			const itemsInGroup = listItems.slice(headerIndex, headerIndex + 10);
			const nextItems = listItems.slice(headerIndex + 10, headerIndex + 20);

			elements.push(
				<Box key={`group-${headerId}`} flexDirection="column">
					<Box
						sticky
						width="100%"
						stickyChildren={
							<Box
								opaque
								borderBottom
								flexDirection="column"
								width="100%"
								paddingLeft={1}
								borderStyle="round"
								borderColor="#000000"
								paddingX={0}
								borderTop={false}
								borderLeft={false}
								borderRight={false}
							>
								<Text>{stickyHeaderText}</Text>
							</Box>
						}
					>
						<Box
							flexDirection="column"
							width="100%"
							paddingLeft={1}
							paddingX={0}
						>
							<Text>{headerText}</Text>
						</Box>
					</Box>
					{itemsInGroup.map(item => (
						<Box key={item.id} paddingLeft={1}>
							<Text color="#999999">{item.text}</Text>
						</Box>
					))}
					<Box
						sticky="bottom"
						width="100%"
						stickyChildren={
							<Box
								opaque
								borderTop
								flexDirection="column"
								width="100%"
								paddingLeft={1}
								borderStyle="round"
								borderColor="#000000"
								paddingX={0}
								borderBottom={false}
								borderLeft={false}
								borderRight={false}
							>
								<Text>{stickyFooterText}</Text>
							</Box>
						}
					>
						<Box paddingLeft={1}>
							<Text>last element matching header (footer naturally here)</Text>
						</Box>
					</Box>
				</Box>,
				...nextItems.map(item => (
					<Box key={item.id} flexDirection="column" paddingLeft={1}>
						<Text key={item.id} color="#999999">
							{item.text}
						</Text>
					</Box>
				)),
			);
		}

		const content = (
			<Box flexDirection="column" flexShrink={0}>
				<Box>
					<Text>Line 1</Text>
				</Box>
				{elements}
				<Text key="last-line" color="yellow">
					This is the last line.
				</Text>
			</Box>
		);

		return useStatic ? (
			<StaticRender
				key={`static-${contentWidth}-${listItems.length}`}
				width={contentWidth}
			>
				{content}
			</StaticRender>
		) : (
			content
		);
	}, [contentWidth, useStatic, listItems]);

	useInput((input, key) => {
		if (input === ' ') {
			setListItems(previous => {
				const newItems = Array.from({length: 20}).map((_, i) => ({
					id: Date.now() + previous.length + i,
					text: `Line ${previous.length + i} - ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(
						((previous.length + i) * 5) % 6,
					)}`,
				}));
				return [...previous, ...newItems];
			});
			setShouldScrollToBottom(true);
			return;
		}

		if (input === 'c') {
			setListItems([]);
			dispatch({type: 'setTop', value: 0});
			return;
		}

		if (input === 'b') {
			setShowScrollbar(s => !s);
			return;
		}

		if (input === 't') {
			setShowBorder(b => !b);
			return;
		}

		if (input === 'f') {
			setIsFooterExpanded(expanded => !expanded);
			return;
		}

		if (input === 'v') {
			setStableScrollback(s => !s);
			return;
		}

		if (input === 'a') {
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

		if (key.upArrow || input === 'w') {
			dispatch({type: 'up', delta: input === 'w' ? 30 : key.shift ? 10 : 1});
			return;
		}

		if (key.downArrow || input === 's') {
			dispatch({
				type: 'down',
				delta: input === 's' ? 30 : key.shift ? 10 : 1,
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
		}
	});

	return (
		<Box flexDirection="column" height={rows} width={columns}>
			<Box
				ref={reference}
				overflowToBackbuffer
				flexGrow={1}
				borderStyle={showBorder ? 'round' : undefined}
				flexShrink={1}
				width={boxWidth}
				flexDirection="column"
				overflowX="hidden"
				overflowY="scroll"
				paddingRight={0}
				scrollTop={scrollTop}
				stableScrollback={
					stableScrollback && !options?.isAlternateBufferEnabled
				}
				scrollbar={showScrollbar}
			>
				{staticContent}
			</Box>
			<Box
				flexDirection="column"
				flexShrink={0}
				overflow="hidden"
				height={isFooterExpanded ? undefined : 2}
			>
				{isFooterExpanded ? (
					<>
						<Text>
							This is a demo showing a scrollable box with sticky headers.
						</Text>
						<Text>
							Press up/down arrow or w/s to scroll vertically (w/s for 30 lines,
							Shift for 10).
						</Text>
						<Text>Press 'space' to add a block, 'c' to clear list.</Text>
						<Text>
							Press 'b' to toggle scrollbar ({showScrollbar ? 'on' : 'off'}),
							't' to toggle border.
						</Text>
						<Text>
							Press 'f' to collapse footer, 'a' to toggle alternate buffer +
							sticky headers (current:{' '}
							{options?.isAlternateBufferEnabled ? 'on' : 'off'})
						</Text>
						<Text>
							Press 'h' to toggle sticky headers in backbuffer (current:{' '}
							{options?.stickyHeadersInBackbuffer ? 'on' : 'off'})
						</Text>
						<Text>
							Press 'v' to toggle stable scrollback (
							{stableScrollback && !options?.isAlternateBufferEnabled
								? 'on'
								: 'off'}
							)
						</Text>
					</>
				) : (
					<Text>press f to expand footer</Text>
				)}
				<Text>
					ScrollTop: {scrollTop}, Size: {size.innerHeight}, Content:{' '}
					{size.scrollHeight}, Added Scroll: {size.addedScrollHeight}
				</Text>
			</Box>
		</Box>
	);
}

export default ScrollableContent;
