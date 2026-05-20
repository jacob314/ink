import React, {type ReactNode} from 'react';
import {LegacyRoot} from 'react-reconciler/constants.js';
import reconciler from './reconciler.js';
import {createNode} from './dom.js';
import {renderToStatic} from './render-node-to-output.js';
import {type Region} from './output.js';
import {accessibilityContext} from './components/AccessibilityContext.js';

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

        const updateFn = () => reconciler.updateContainer(tree, container, null, () => {});
        updateFn();
        // @ts-expect-error
        reconciler.flushSyncWork();

        renderToStatic(rootNode, {
                calculateLayout: true,
                skipStaticElements: false,
        });

        for (let i = 0; i < 5; i++) {
                // @ts-expect-error
                reconciler.flushSyncWork();
                renderToStatic(rootNode, {
                        calculateLayout: true,
                        skipStaticElements: false,
                });
        }

        const triggerOnRendered = (n: any) => {
                if (n.nodeName === 'ink-static-render' && n.cachedRender && n.internal_onRendered) {
                        n.internal_onRendered(n);
                }
                for (const child of n.childNodes || []) {
                        triggerOnRendered(child);
                }
        };
        triggerOnRendered(rootNode);

        // @ts-expect-error
        reconciler.flushSyncWork();

        renderToStatic(rootNode, {
                calculateLayout: true,
                skipStaticElements: false,
        });

        const region = rootNode.cachedRender!;

        if (region && region.lines && region.lines.length === 0 && region.styledOutput && region.styledOutput.length > 0) {
            // @ts-expect-error
            region.lines = region.styledOutput;
        }

        const cleanupFn = () => reconciler.updateContainer(null, container, null, () => {});
        cleanupFn();
        // @ts-expect-error
        reconciler.flushSyncWork();

        return region;
};
