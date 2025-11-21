import React, {useRef, useLayoutEffect} from 'react';
import {Box, type DOMElement, type BoxProps} from '../../src/index.js';

export type CaptureRootProps = {
	readonly onCapture: (node: DOMElement) => void;
	readonly children: React.ReactNode;
} & BoxProps;

export function CaptureRoot({onCapture, children, ...props}: CaptureRootProps) {
	const ref = useRef<DOMElement>(null);

	useLayoutEffect(() => {
		if (ref.current) {
			onCapture(ref.current);
		}
	});

	return (
		<Box ref={ref} {...props}>
			{children}
		</Box>
	);
}
