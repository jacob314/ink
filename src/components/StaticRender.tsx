import React, {useLayoutEffect, useState, useRef, type ReactNode} from 'react';
import {type DOMElement} from '../dom.js';
import {renderToStatic} from '../render-node-to-output.js';
import {type Styles} from '../styles.js';

export type Props = {
	readonly children: ReactNode;
	readonly width: number;
	readonly style?: Styles;
};

export default function StaticRender({children, width, style}: Props) {
	const [isChildrenSaved, setIsChildrenSaved] = useState(false);
	const ref = useRef<DOMElement>(null);

	useLayoutEffect(() => {
		if (ref.current && !isChildrenSaved) {
			renderToStatic(ref.current, {
				calculateLayout: true,
			});
			setIsChildrenSaved(true);
		}
	}, [children, isChildrenSaved]);

	return (
		<ink-static-render ref={ref} style={{...style, width}}>
			{isChildrenSaved ? null : children}
		</ink-static-render>
	);
}
