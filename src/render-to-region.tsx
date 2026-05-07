import React, {type ReactNode} from 'react';
import {LegacyRoot} from 'react-reconciler/constants.js';
import Yoga from 'yoga-layout';
import reconciler from './reconciler.js';
import {createNode, type DOMElement} from './dom.js';
import {renderToStatic} from './render-node-to-output.js';
import {type Region} from './output.js';
import {accessibilityContext} from './components/AccessibilityContext.js';

const noop = () => {};

const renderPendingStaticRenderNodes = (
	node: DOMElement,
	width: number,
): void => {
	for (const child of node.childNodes) {
		if (child.nodeName !== '#text') {
			renderPendingStaticRenderNodes(child, width);
		}
	}

	if (node.nodeName !== 'ink-static-render' || node.cachedRender) {
		return;
	}

	const staticWidth =
		typeof node.style.width === 'number' ? node.style.width : width;

	node.yogaNode?.setWidth(staticWidth);
	node.yogaNode?.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);

	renderToStatic(node, {
		calculateLayout: true,
		skipStaticElements: false,
	});
};

export const renderToRegion = (
	node: ReactNode,
	options: {width: number},
): Region => {
	const rootNode = createNode('ink-root');
	rootNode.yogaNode!.setWidth(options.width);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const container = reconciler.createContainer(
		rootNode,
		LegacyRoot,
		null,
		false,
		null,
		`id-${Math.random()}`,
		noop,
		noop,
		noop,
		noop,
		null,
	);

	const tree = (
		<accessibilityContext.Provider value={{isScreenReaderEnabled: false}}>
			{node}
		</accessibilityContext.Provider>
	);

	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.updateContainerSync(tree, container, null, noop);
	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.flushSyncWork();

	renderPendingStaticRenderNodes(rootNode, options.width);
	renderToStatic(rootNode, {
		calculateLayout: true,
		skipStaticElements: false,
	});

	const triggerOnRendered = (n: DOMElement) => {
		if (n.nodeName === 'ink-static-render' && n.cachedRender) {
			n.internal_onRendered?.(n);
		}

		for (const child of n.childNodes) {
			if (child.nodeName !== '#text') {
				triggerOnRendered(child);
			}
		}
	};

	triggerOnRendered(rootNode);

	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.flushSyncWork();

	const region = rootNode.cachedRender!;

	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.updateContainerSync(null, container, null, noop);
	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.flushSyncWork();

	return region;
};
