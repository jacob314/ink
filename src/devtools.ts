// eslint-disable-next-line import/no-unassigned-import
import './devtools-window-polyfill.js';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import devtools from 'react-devtools-core';

(devtools as any).initialize();

(devtools as any).connectToDevTools();
