/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React, {
	useState,
	useRef,
	useEffect,
	useLayoutEffect,
	useMemo,
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
} from '../../src/index.js';
import { debugLog } from '../../src/debug-log.js';

type ScrollMode = 'vertical' | 'horizontal' | 'both' | 'hidden';

const useStatic = true;

const items = Array.from({length: 2000}).map((_, i) => {
	const lineCount =i % 8 + 3; // 3 to 10 lines
	const hasYellowText = i%3 == 0;

	const lines = Array.from({length: lineCount}).map((_, j) => {
		if (j === 0 && hasYellowText) {
			return {
				text: `This is the first line of box ${i} with yellow text.`,
				color: 'yellow',
			};
		}

		if (j == 0) {
				return {
				text: `This is the first line of box ${i}`,
				color: 'blue',
			};
		}

		return {
			text: `${j} This is line in a line in a box. This is some text that is long enough to require some word wrapping.`,
		};
	});

	return {
		id: i,
		lines,
	};
});

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

function ScrollableContent() {
	const [scrollMode, setScrollMode] = useState<ScrollMode>('vertical');
	const [scrollTop, setScrollTop] = useState(0);
	const [scrollLeft, setScrollLeft] = useState(0);
	const [verticalScrollbar, setVerticalScrollbar] = useState<
		ScrollbarBoundingBox | undefined
	>(undefined);
	const [showScrollbars, setShowScrollbars] = useState(false);
	const reference = useRef<DOMElement>(null);
	const {columns, rows} = useTerminalSize();
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

			debugLog('XXX scrollHeight:' + scrollHeight + ' innerHeight:' + innerHeight);
			if (scrollTop === Number.MAX_SAFE_INTEGER) {
				setScrollTop(Math.max(0, scrollHeight - innerHeight));
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
			setScrollTop(
				Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			);
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

		if (!key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
			return;
		}

		if (scrollIntervalReference.current) {
			clearInterval(scrollIntervalReference.current);
		}

		const scroll = (
			setter: React.Dispatch<React.SetStateAction<number>>,
			getNewValue: (current: number) => number,
			frames = 5,
			interval = 1,
		) => {
			let frame = 0;
			scrollIntervalReference.current = setInterval(() => {
				if (frame < frames) {
					setter(s => getNewValue(s));
					frame++;
				} else if (scrollIntervalReference.current) {
					clearInterval(scrollIntervalReference.current);
					scrollIntervalReference.current = null;
				}
			}, interval);
		};

		if (key.upArrow) {
			scroll(setScrollTop, s => Math.max(0, s - 1), 1, 16);
		}

		if (key.downArrow) {
			scroll(
				setScrollTop,
				s =>
					Math.min(
						s + 1,
						Math.max(
							0,
							sizeReference.current.scrollHeight -
								sizeReference.current.innerHeight,
						),
					),
				1,
				16,
			);
		}

		if (key.leftArrow) {
			scroll(setScrollLeft, s => Math.max(0, s - 1));
		}

		if (key.rightArrow) {
			scroll(setScrollLeft, s =>
				Math.min(
					s + 1,
					Math.max(
						0,
						sizeReference.current.scrollWidth -
							sizeReference.current.innerWidth,
					),
				),
			);
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
					<Text key={index} color={line.color}>
						{line.text}
					</Text>
				))}
			</Box>
		));

		if (useStatic) {
			return (
				<StaticRender width={columns - 2} key={`my-static-render-${columns}`}>
					{children}
				</StaticRender>
			);
		}

		return (
			<Box width={columns - 2} key="my-static-render" flexDirection="column">
				{children}
			</Box>
		);
	}, [columns]);

	return (
		<Box flexDirection="column" height={rows} width={columns}>
			<Box
				ref={reference}
				flexShrink={1}
				width={columns}
				flexDirection="column"
				overflowX={overflowX}
				overflowY={overflowY}
				overflowToBackbuffer
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
