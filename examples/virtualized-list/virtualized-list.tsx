import React, {useRef} from 'react';
import {Box, Text, useInput} from '../../src/index.js';
import VirtualizedList, {
	VirtualizedListRef,
} from '../../src/components/VirtualizedList.js';

const items = Array.from({length: 10000}).map((_, i) => ({
	id: i,
	text: `Line ${i}` + ' ' + '-'.repeat(i % 950) + '\nEND_OF_ITEM',
}));

const VirtualizedListExample = () => {
	const ref = useRef<VirtualizedListRef>(null);

	useInput((input, key) => {
		if (key.upArrow) {
			ref.current?.scrollBy(-1);
		}

		if (key.downArrow) {
			ref.current?.scrollBy(1);
		}

		if (key.leftArrow) {
			ref.current?.scrollToIndex({index: ref.current?.getScrollIndex() - 1});
		}

		if (key.rightArrow) {
			ref.current?.scrollToIndex({index: ref.current?.getScrollIndex() + 1});
		}

		if (input === 'i') {
			console.log('Current scroll index:', ref.current?.getScrollIndex());
		}
	});

	return (
		<Box height={20} flexDirection="column">
			<Text>Press up/down arrows to scroll. Page up/down to scroll faster.</Text>
			<VirtualizedList
				ref={ref}
				data={items}
				renderItem={({item}: {item: {id: number; text: string}}) => (
					<Text>{item.text}</Text>
				)}
				initialScrollIndex={Number.MAX_SAFE_INTEGER}
				estimatedItemHeight={() => 1}
				keyExtractor={(item: {id: number; text: string}) => String(item.id)}
			/>
		</Box>
	);
};

export default VirtualizedListExample;