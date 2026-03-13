import React, {useEffect} from 'react';
import {render, useStdout, useApp, Text} from '../../src/index.js';

function WriteToStdout() {
	const {write} = useStdout();
	const {exit} = useApp();

	useEffect(() => {
		write('Hello from Ink to stdout\n');
		setTimeout(() => {
			exit();
		}, 500);
	}, [write, exit]);

	return <Text>Hello World</Text>;
}

const app = render(<WriteToStdout />);

await app.waitUntilExit();
console.log('exited');

