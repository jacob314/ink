import React, {
	useRef,
	useEffect,
	useMemo,
	useState,
	useLayoutEffect,
	type ReactNode,
} from 'react';
import {type DOMElement} from '../dom.js';
import {type Styles} from '../styles.js';

export type Props<T> = {
	readonly items?: T[];
	readonly width: number;
	readonly style?: Styles;
	readonly children: ReactNode | ((item: T, index: number) => ReactNode);
};

export default function StaticRender<T>({
	items = [undefined as unknown as T],
	children: render,
	width,
	style,
}: Props<T>) {
	const ref = useRef<DOMElement>(null);
	const [index, setIndex] = useState(0);

	const itemsToRender: T[] = useMemo(() => {
		return items.slice(index);
	}, [items, index]);

	useLayoutEffect(() => {
		setIndex(items.length);
	}, [items.length]);

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	const children = itemsToRender.map((item, itemIndex) => {
		if (typeof render === 'function') {
			return (render as (item: T, index: number) => ReactNode)(
				item,
				index + itemIndex,
			);
		}

		return render;
	});
	useEffect(() => {
		const node = ref.current;
		return () => {
			if (node) {
				node.cachedRender = undefined;
			}
		};
	}, []);

	return (
		<ink-static-render ref={ref} style={{...style, width}}>
			{children}
		</ink-static-render>
	);
}
