import {createContext} from 'react';
import {type Selection} from '../selection.js';

export type InkOptions = {
	readonly isAlternateBufferEnabled?: boolean;
	readonly stickyHeadersInBackbuffer?: boolean;
	readonly animatedScroll?: boolean;
	readonly animationInterval?: number;
	readonly backbufferUpdateDelay?: number;
	readonly maxScrollbackLength?: number;

	/**
	 * When set to true, Ink will attempt to force the terminal to scroll to the bottom
	 * when performing a full re-render (e.g. when the backbuffer is refreshed).
	 *
	 * Currently this is only supported in VS Code due to lack of robust APIs in other
	 * terminals to force scrolling to the bottom.
	 */
	readonly forceScrollToBottomOnBackbufferRefresh?: boolean;
};

export type Props = {
	/**
	Exit (unmount) the whole Ink app.
	*/
	readonly exit: (error?: Error) => void;

	/**
	Force a full rerender of the app, clearing the screen.
	*/
	readonly rerender: () => void;
	readonly selection?: Selection;
	readonly options: InkOptions;
	readonly setOptions: (options: Partial<InkOptions>) => void;
};

/**
`AppContext` is a React context that exposes a method to manually exit the app (unmount).
*/
// eslint-disable-next-line @typescript-eslint/naming-convention
export const AppContext = createContext<Props>({
	exit() {},
	rerender() {},
	options: {},
	setOptions() {},
});

AppContext.displayName = 'AppContext';

export default AppContext;
