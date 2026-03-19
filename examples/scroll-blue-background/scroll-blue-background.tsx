/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import React, {
	useReducer,
	useRef,
	useEffect,
	useLayoutEffect,
	useState,
	useContext,
} from 'react';
import {
	Box,
	Text,
	useInput,
	getInnerHeight,
	getScrollHeight,
	type DOMElement,
	AppContext,
} from '../../src/index.js';

type ScrollState = {
	scrollTop: number;
};

type ScrollAction =
	| {type: 'up'; delta: number}
	| {type: 'down'; delta: number; max: number};

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
	}
}

function ScrollableContent({
	exportFilename = '',
}: {
	readonly exportFilename?: string;
}) {
	const [scrollState, dispatch] = useReducer(scrollReducer, {
		scrollTop: 0,
	});
	const {scrollTop} = scrollState;
	const reference = useRef<DOMElement>(null);
	const {dumpCurrentFrame} = useContext(AppContext);

	useEffect(() => {
		let innerTimeout: NodeJS.Timeout;

		if (exportFilename) {
			const timeout = setTimeout(() => {
				dumpCurrentFrame(exportFilename);
				console.log('Dumping frame to:', exportFilename);
				innerTimeout = setTimeout(() => {
					// eslint-disable-next-line unicorn/no-process-exit
					process.exit(0);
				}, 500);
			}, 100);

			return () => {
				clearTimeout(timeout);
				if (innerTimeout) {
					clearTimeout(innerTimeout);
				}
			};
		}

		return undefined;
	}, [exportFilename, dumpCurrentFrame]);

	const [size, setSize] = useState({
		innerHeight: 0,
		scrollHeight: 0,
	});

	const sizeReference = useRef(size);
	useEffect(() => {
		sizeReference.current = size;
	}, [size]);

	useLayoutEffect(() => {
		if (reference.current) {
			const innerHeight = getInnerHeight(reference.current);
			const scrollHeight = getScrollHeight(reference.current);

			if (
				size.innerHeight !== innerHeight ||
				size.scrollHeight !== scrollHeight
			) {
				setSize({innerHeight, scrollHeight});
			}
		}
	});

	useInput((input, key) => {
		if (input === 's') {
			dumpCurrentFrame('snapshot.json');
			return;
		}

		if (key.upArrow) {
			dispatch({type: 'up', delta: 1});
		}

		if (key.downArrow) {
			dispatch({
				type: 'down',
				delta: 1,
				max: Math.max(
					0,
					sizeReference.current.scrollHeight -
						sizeReference.current.innerHeight,
				),
			});
		}
	});

	const items = Array.from({length: 100}).map((_, i) => (
		// eslint-disable-next-line react/no-array-index-key
		<Text key={i}>
			This is line {i + 1} of arbitrary text in the scrollable region.
		</Text>
	));

	return (
		<Box flexDirection="column" padding={1}>
			<Text>
				Use Up/Down arrows to scroll. Press 's' to export snapshot. Press
				'Ctrl+C' to exit.
			</Text>
			<Box
				ref={reference}
				opaque
				scrollbar
				height={30}
				width={30}
				flexDirection="column"
				overflowY="scroll"
				overflowX="hidden"
				backgroundColor="blue"
				scrollTop={scrollTop}
				marginTop={1}
				paddingRight={1}
			>
				<Box flexDirection="column" flexShrink={0} width={50}>
					{items}
				</Box>
			</Box>
		</Box>
	);
}

export default ScrollableContent;
