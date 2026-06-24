import React, {type ReactNode} from 'react';
import {LegacyRoot} from 'react-reconciler/constants.js';
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

	renderToStatic(node, {
		calculateLayout: true,
		skipStaticElements: false,
	});
};

let nextRegionId = 0;

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
		`id-${nextRegionId++}`,
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

	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.flushSyncWork();

	const region = rootNode.cachedRender;
	if (!region) {
		throw new Error('renderToRegion failed to produce a cached region');
	}

	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.updateContainerSync(null, container, null, noop);
	// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
	reconciler.flushSyncWork();

	return region;
};
