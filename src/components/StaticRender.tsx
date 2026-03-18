import React, {useLayoutEffect, useState, useRef, type ReactNode} from 'react';
import {type DOMElement, type CachedRender} from '../dom.js';
import {renderToStatic} from '../render-node-to-output.js';
import {type Styles} from '../styles.js';

export type Props = {
	readonly children: ReactNode;
	readonly width: number;
	readonly style?: Styles;
};

export default function StaticRender({children, width, style}: Props) {
	const [cachedRender, setCachedRender] = useState<CachedRender | undefined>();
	const ref = useRef<DOMElement>(null);

	useLayoutEffect(() => {
		if (ref.current && !cachedRender) {
			const result = renderToStatic(ref.current, {
				calculateLayout: true,
			});
			setCachedRender(result);
		}
	}, [children, cachedRender]);

	return (
		<ink-static-render
			ref={ref}
			style={{...style, width}}
			cachedRender={cachedRender}
		>
			{cachedRender ? null : children}
		</ink-static-render>
	);
}
