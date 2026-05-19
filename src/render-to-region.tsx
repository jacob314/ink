/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {type ReactNode} from 'react';
import {LegacyRoot} from 'react-reconciler/constants.js';
import reconciler from './reconciler.js';
import {createNode} from './dom.js';
import {renderToStatic} from './render-node-to-output.js';
import {type Region} from './output.js';
import {accessibilityContext} from './components/AccessibilityContext.js';

/**
 * Renders a React node to an offline Region.
 * This is useful for measuring the size of a component before rendering it to the screen,
 * or caching complex static renders.
 *
 * @param node The React node to render.
 * @param options Configuration options, such as the `width` of the terminal.
 * @returns The cached Region containing the layout and rendered lines.
 */
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
		() => {},
		() => {},
		() => {},
		() => {},
		null,
	);

	const tree = (
		<accessibilityContext.Provider value={{isScreenReaderEnabled: false}}>
			{node}
		</accessibilityContext.Provider>
	);

	// In React 18, if we are inside a commit phase (e.g. useLayoutEffect), updateContainerSync might not be fully synchronous.
	// Using flushSync forces the reconciler to process the update immediately.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, prefer-destructuring
	const flushSync = (reconciler as any).flushSync;
	if (typeof flushSync === 'function') {
		flushSync(() => {
			reconciler.updateContainer(tree, container, null, () => {});
		});
	} else {
		// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
		reconciler.updateContainerSync(tree, container, null, () => {});
		// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
		reconciler.flushSyncWork();
	}

	renderToStatic(rootNode, {
		calculateLayout: true,
		skipStaticElements: false,
	});

	const region = rootNode.cachedRender!;

	if (typeof flushSync === 'function') {
		flushSync(() => {
			reconciler.updateContainer(null, container, null, () => {});
		});
	} else {
		// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
		reconciler.updateContainerSync(null, container, null, () => {});
		// @ts-expect-error the types for `react-reconciler` are not up to date with the library.
		reconciler.flushSyncWork();
	}

	return region;
};
