import {PassThrough} from 'node:stream';
import process from 'node:process';
import test from 'ava';
import {TerminalWriter} from '../src/worker/terminal-writer.js';
import {ris} from '../src/worker/ansi-utils.js';

test.serial(
	'TerminalWriter.clear() does NOT use ris in VSCode by default',
	t => {
		const originalTermProgram = process.env['TERM_PROGRAM'];
		process.env['TERM_PROGRAM'] = 'vscode';
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const stdout = new PassThrough() as any;
			let output = '';
			stdout.write = (chunk: string) => {
				output += chunk;
				return true;
			};

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const writer = new TerminalWriter(80, 24, stdout);
			writer.clear();
			writer.flush();

			t.false(output.includes(ris));
		} finally {
			process.env['TERM_PROGRAM'] = originalTermProgram;
		}
	},
);

test.serial(
	'TerminalWriter.clear() DOES use ris in VSCode when forceScrollToBottomOnBackbufferRefresh is true',
	t => {
		const originalTermProgram = process.env['TERM_PROGRAM'];
		process.env['TERM_PROGRAM'] = 'vscode';
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const stdout = new PassThrough() as any;
			let output = '';
			stdout.write = (chunk: string) => {
				output += chunk;
				return true;
			};

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const writer = new TerminalWriter(80, 24, stdout);
			writer.forceScrollToBottomOnBackbufferRefresh = true;
			writer.clear();
			writer.flush();

			t.true(output.includes(ris));
		} finally {
			process.env['TERM_PROGRAM'] = originalTermProgram;
		}
	},
);
