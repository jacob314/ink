import {createContext} from 'react';

export type Props = {
	/**
	Exit (unmount) the whole Ink app.
	*/
	readonly exit: (error?: Error) => void;

	/**
	Force a full rerender of the app, clearing the screen.
	*/
	readonly rerender: () => void;
};

/**
`AppContext` is a React context that exposes a method to manually exit the app (unmount).
*/
// eslint-disable-next-line @typescript-eslint/naming-convention
const AppContext = createContext<Props>({
	exit() {},
	rerender() {},
});

AppContext.displayName = 'InternalAppContext';

export default AppContext;
