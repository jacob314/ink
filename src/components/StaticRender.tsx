import React, {useRef, useEffect, useState, type ReactNode} from 'react';
import {markNodeAsDirty, type DOMElement} from '../dom.js';
import {type Styles} from '../styles.js';

export type Props = {
	readonly children: () => ReactNode;
	readonly width: number;
	readonly style?: Styles;
};

export default function StaticRender({children, width, style}: Props) {
	const ref = useRef<DOMElement>(null);
	const [isRendered, setIsRendered] = useState(false);
	const prevChildren = useRef(children);

	let shouldRender = !isRendered;

	if (children !== prevChildren.current) {
		prevChildren.current = children;
		shouldRender = true;
		if (isRendered) {
			setIsRendered(false);
		}

		if (ref.current) {
			ref.current.cachedRender = undefined;
			markNodeAsDirty(ref.current);
		}
	}

	useEffect(() => {
		const node = ref.current;
		return () => {
			if (node) {
				node.cachedRender = undefined;
			}
		};
	}, []);

	return (
		<ink-static-render
			ref={ref}
			style={{...style, width}}
			internal_onRendered={() => {
				setIsRendered(true);
			}}
		>
			{shouldRender ? children() : null}
		</ink-static-render>
	);
}
