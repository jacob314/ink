import * as fs from 'node:fs';
import {spawn} from 'node-pty';

const ps = spawn(
	'node',
	['--loader', 'ts-node/esm', 'examples/scroll/index.ts'],
	{
		name: 'xterm-color',
		cols: 80,
		rows: 20,
		env: {
			...process.env,
			FORCE_COLOR: 'true',
		},
	},
);

const output = fs.createWriteStream('pty.log');

ps.onData(data => {
	output.write(data);
});

setTimeout(() => {
	ps.write('q');
}, 4000);

setTimeout(() => {
	ps.kill();
	process.exit(0);
}, 5000);
