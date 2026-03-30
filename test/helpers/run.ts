import process from 'node:process';
import {createRequire} from 'node:module';
import path from 'node:path';
import url from 'node:url';
import type * as nodePty from 'node-pty';

const require = createRequire(import.meta.url);

const {spawn} = require('node-pty') as typeof nodePty;

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

type Run = (
	fixture: string,
	props?: {env?: Record<string, string>; columns?: number; rows?: number},
) => Promise<string>;

export const run: Run = async (fixture, props) => {
	const projectRoot = path.join(__dirname, '../../');
	const fixturePath = path.join(projectRoot, `test/fixtures/${fixture}.tsx`);

	const pathSeparator = process.platform === 'win32' ? ';' : ':';
	const newPath = `${path.join(projectRoot, 'node_modules/.bin')}${pathSeparator}${process.env['PATH']}`;

	const env: Record<string, string> = {
		...(process.env as Record<string, string>),

		CI: 'false',
		...props?.env,

		NODE_NO_WARNINGS: '1',

		PATH: newPath,
	};

	return new Promise<string>((resolve, reject) => {
		const term = spawn(
			process.execPath,
			['--loader=ts-node/esm', fixturePath],
			{
				name: 'xterm-color',
				cols: typeof props?.columns === 'number' ? props.columns : 100,
				rows: typeof props?.rows === 'number' ? props.rows : 30,
				cwd: projectRoot,
				env,
			},
		);

		let output = '';

		term.onData(data => {
			output += data;
		});

		term.onExit(({exitCode}) => {
			if (exitCode === 0) {
				resolve(output);
				return;
			}

			reject(
				new Error(
					`Process exited with a non-zero code: ${exitCode}\nOutput: ${output}`,
				),
			);
		});
	});
};
