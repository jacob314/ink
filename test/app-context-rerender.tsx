import React, {useEffect} from 'react';
import test from 'ava';
import ansiEscapes from 'ansi-escapes';
import {type SinonSpy} from 'sinon';
import {render, useApp, Text} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

type Case = {
	name: string;
	alternateBuffer: boolean;
	check: (calls: string[]) => boolean;
	message: string;
};

const cases: Case[] = [
	{
		name: 'rerender method in AppContext forces full rerender',
		alternateBuffer: false,
		check: (calls: string[]) =>
			calls.some(arg => arg.includes(ansiEscapes.eraseLines(1))),
		message: 'Should erase lines on rerender',
	},
	{
		name: 'rerender method in AppContext forces full rerender in alternate buffer mode',
		alternateBuffer: true,
		check: (calls: string[]) =>
			calls.some(
				arg =>
					arg.includes(ansiEscapes.eraseScreen) ||
					arg.includes(ansiEscapes.clearTerminal),
			),
		message: 'Should clear screen on rerender in alternate buffer mode',
	},
];

for (const {name, alternateBuffer, check, message} of cases) {
	test(name, t => {
		const stdout = createStdout();
		const write = stdout.write as SinonSpy;

		function Test() {
			const {rerender} = useApp();

			useEffect(() => {
				rerender();
			}, [rerender]);

			return <Text>Hello</Text>;
		}

		const {unmount} = render(<Test />, {
			stdout,
			alternateBuffer,
		});

		const calls = write.getCalls().map(call => call.args[0] as string);
		t.true(check(calls), `${message}`);

		unmount();
	});
}
