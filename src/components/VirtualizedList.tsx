import React, {
	useState,
	useRef,
	useLayoutEffect,
	forwardRef,
	useImperativeHandle,
	useEffect,
	useMemo,
	useCallback,
} from 'react';
import {Box, measureElement} from '../../src/index.js';
import {DOMElement} from '../dom.js';


type VirtualizedListProps<T> = {
	data: T[];
	renderItem: (info: {item: T; index: number}) => React.ReactElement;
	estimatedItemHeight: (index: number) => number;
	keyExtractor: (item: T, index: number) => string;
	initialScrollIndex?: number;
	initialScrollOffsetInIndex?: number;
};

export type VirtualizedListRef = {
	scrollBy: (delta: number) => void;
	scrollTo: (offset: number) => void;
	scrollToEnd: () => void;
	scrollToIndex: (params: {
		index: number;
		viewOffset?: number;
		viewPosition?: number;
	}) => void;
	scrollToItem: (params: {
		item: any;
		viewOffset?: number;
		viewPosition?: number;
	}) => void;
	getScrollIndex: () => number;
};

function findLastIndex<T>(
	array: T[],
	predicate: (value: T, index: number, obj: T[]) => unknown,
): number {
	for (let i = array.length - 1; i >= 0; i--) {
		if (predicate(array[i]!, i, array)) {
			return i;
		}
	}
	return -1;
}

const VirtualizedList = forwardRef(
	<T,>(
		{
			data,
			renderItem,
			estimatedItemHeight,
			keyExtractor,
			initialScrollIndex,
			initialScrollOffsetInIndex,
		}: VirtualizedListProps<T>,
		ref: React.Ref<VirtualizedListRef>,
	) => {
		const [scrollAnchor, setScrollAnchor] = useState(() => {
			const scrollToEnd =
				initialScrollIndex === Number.MAX_SAFE_INTEGER ||
				(typeof initialScrollIndex === 'number' &&
					initialScrollIndex >= data.length - 1 &&
					initialScrollOffsetInIndex === Number.MAX_SAFE_INTEGER);

			if (scrollToEnd) {
				return {
					index: data.length > 0 ? data.length - 1 : 0,
					offset: Number.MAX_SAFE_INTEGER,
				};
			}

			if (typeof initialScrollIndex === 'number') {
				return {
					index: Math.max(0, Math.min(data.length - 1, initialScrollIndex)),
					offset: initialScrollOffsetInIndex ?? 0,
				};
			}

			return {index: 0, offset: 0};
		});
		const containerRef = useRef<DOMElement>(null);
		const [containerHeight, setContainerHeight] = useState(0);
		const itemRefs = useRef<(DOMElement | null)[]>([]);
		const [heights, setHeights] = useState<number[]>([]);
		const isInitialScrollSet = useRef(false);

		const {totalHeight, offsets} = useMemo(() => {
			const offsets: number[] = [0];
			let totalHeight = 0;
			for (let i = 0; i < data.length; i++) {
				const height = heights[i] ?? estimatedItemHeight(i);
				totalHeight += height;
				offsets.push(totalHeight);
			}
			return {totalHeight, offsets};
		}, [heights, data, estimatedItemHeight]);

		useEffect(() => {
			setHeights(data.map((_, index) => estimatedItemHeight(index)));
		}, [data, estimatedItemHeight]);

		useLayoutEffect(() => {
			if (containerRef.current) {
				const {height} = measureElement(containerRef.current);
				setContainerHeight(height);
			}
		}, []);

		const scrollableContainerHeight = containerHeight > 1 ? containerHeight - 2 : 0;

		const getAnchorForScrollTop = useCallback(
			(
				scrollTop: number,
				offsets: number[],
			): {index: number; offset: number} => {
				const index = findLastIndex(offsets, offset => offset <= scrollTop);
				if (index === -1) {
					return {index: 0, offset: 0};
				}

				return {index, offset: scrollTop - offsets[index]!};
			},
			[],
		);

		const scrollTop = useMemo(() => {
			const offset = offsets[scrollAnchor.index];
			if (typeof offset !== 'number') {
				return 0;
			}

			if (scrollAnchor.offset === Number.MAX_SAFE_INTEGER) {
				const itemHeight = heights[scrollAnchor.index] ?? 0;
				return offset + itemHeight - scrollableContainerHeight;
			}

			return offset + scrollAnchor.offset;
		}, [scrollAnchor, offsets, heights, scrollableContainerHeight]);

		useLayoutEffect(() => {
			if (
				isInitialScrollSet.current ||
				offsets.length <= 1 ||
				totalHeight <= 0 ||
				containerHeight <= 0
			) {
				return;
			}

			if (typeof initialScrollIndex === 'number') {
				const scrollToEnd =
					initialScrollIndex === Number.MAX_SAFE_INTEGER ||
					(initialScrollIndex >= data.length - 1 &&
						initialScrollOffsetInIndex === Number.MAX_SAFE_INTEGER);

				if (scrollToEnd) {
					setScrollAnchor({
						index: data.length - 1,
						offset: Number.MAX_SAFE_INTEGER,
					});
					isInitialScrollSet.current = true;
					return;
				}

				const index = Math.max(
					0,
					Math.min(data.length - 1, initialScrollIndex),
				);
				const offset = initialScrollOffsetInIndex ?? 0;
				const newScrollTop = (offsets[index] ?? 0) + offset;

				const clampedScrollTop = Math.max(
					0,
					Math.min(totalHeight - scrollableContainerHeight, newScrollTop),
				);

				setScrollAnchor(getAnchorForScrollTop(clampedScrollTop, offsets));
				isInitialScrollSet.current = true;
			} 
		}, [
			initialScrollIndex,
			initialScrollOffsetInIndex,
			offsets,
			totalHeight,
			containerHeight,
			getAnchorForScrollTop,
			data.length,
			heights,
			scrollableContainerHeight,
		]);

		const startIndex = Math.max(
			0,
			findLastIndex(offsets, offset => offset <= scrollTop) - 10,
		);
		const endIndexOffset = offsets.findIndex(
			offset => offset > scrollTop + scrollableContainerHeight,
		);
		const endIndex =
			endIndexOffset === -1
				? data.length - 1
				: Math.min(data.length - 1, endIndexOffset + 10);

		const topSpacerHeight = offsets[startIndex] ?? 0;
		const bottomSpacerHeight =
			totalHeight - (offsets[endIndex + 1] ?? totalHeight);

		const renderedItems = [];
		for (let i = startIndex; i <= endIndex; i++) {
			const item = data[i];
			if (item) {
				renderedItems.push(
					<Box
						key={keyExtractor(item, i)}
						width="100%"
						ref={el => {
							itemRefs.current[i] = el;
						}}
					>
						{renderItem({item, index: i})}
					</Box>,
				);
			}
		}

		useLayoutEffect(() => {
			for (let i = startIndex; i <= endIndex; i++) {
				const itemRef = itemRefs.current[i];
				if (itemRef) {
					const {height} = measureElement(itemRef);
					if (height !== heights[i]) {
						const newHeights = [...heights];
						newHeights[i] = height;
						setHeights(newHeights);
					}
				}
			}
		});

		useImperativeHandle(
			ref,
			() => ({
				scrollBy: (delta: number) => {
					const currentScrollTop =
						(offsets[scrollAnchor.index] ?? 0) + scrollAnchor.offset;
					const newScrollTop = Math.max(
						0,
						Math.min(
							totalHeight - scrollableContainerHeight,
							currentScrollTop + delta,
						),
					);
					setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
				},
				scrollTo: (offset: number) => {
					const newScrollTop = Math.max(
						0,
						Math.min(totalHeight - scrollableContainerHeight, offset),
					);
					setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
				},
				scrollToEnd: () => {
					const newScrollTop = Math.max(
						0,
						totalHeight - scrollableContainerHeight,
					);
					setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
				},
				scrollToIndex: ({
					index,
					viewOffset = 0,
					viewPosition = 0,
				}: {
					index: number;
					viewOffset?: number;
					viewPosition?: number;
				}) => {
					const offset = offsets[index];
					if (offset !== undefined) {
						const newScrollTop = Math.max(
							0,
							Math.min(
								totalHeight - scrollableContainerHeight,
								offset -
									viewPosition * scrollableContainerHeight +
									viewOffset,
							),
						);
						setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
					}
				},
				scrollToItem: ({
					item,
					viewOffset = 0,
					viewPosition = 0,
				}: {
					item: T;
					viewOffset?: number;
					viewPosition?: number;
				}) => {
					const index = data.indexOf(item);
					if (index !== -1) {
						const offset = offsets[index];
						if (offset !== undefined) {
							const newScrollTop = Math.max(
								0,
								Math.min(
									totalHeight - scrollableContainerHeight,
									offset -
										viewPosition * scrollableContainerHeight +
										viewOffset,
								),
							);
							setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
						}
					}
				},
				getScrollIndex: () => scrollAnchor.index,
			}),
			[
				offsets,
				scrollAnchor,
				totalHeight,
				containerHeight,
				getAnchorForScrollTop,
				data,
				scrollableContainerHeight,
			],
		);

		return (
			<Box
				borderStyle="round"
				ref={containerRef}
				overflowY="scroll"
				overflowX="hidden"
				scrollTop={scrollTop}
				width="100%"
				height="100%"
				flexDirection="column"
			>
				<Box flexShrink={0} width="100%" flexDirection="column">
					<Box height={topSpacerHeight} flexShrink={0} />
					{renderedItems}
					<Box height={bottomSpacerHeight} flexShrink={0} />
				</Box>
			</Box>
		);
	},
);

export default VirtualizedList;