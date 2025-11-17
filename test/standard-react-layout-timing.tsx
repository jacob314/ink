import React, {useLayoutEffect} from 'react';
import test from 'ava';
import delay from 'delay';
import {render, Text} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('standardReactLayoutTiming: true - effect runs before initial render to stdout', async t => {
	const stdout = createStdout();
	const events: string[] = [];

	function App() {
		useLayoutEffect(() => {
			events.push('effect');
		}, []);

		return <Text>Hello</Text>;
	}

	const originalWrite = stdout.write;
	// @ts-expect-error - mocking write
	stdout.write = (chunk: string, encoding?: any, cb?: any) => {
		events.push('write');
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		return originalWrite(chunk, encoding, cb);
	};

	render(<App />, {
		stdout,
		debug: true,
		standardReactLayoutTiming: true,
	});

	await delay(0);

	t.is(events[0], 'effect');
	t.true(events.includes('write'));
});

test('standardReactLayoutTiming: false - write happens before effect (reproducing current behavior)', async t => {
	const stdout = createStdout();
	const events: string[] = [];

	function App() {
		useLayoutEffect(() => {
			events.push('effect');
		}, []);

		return <Text>Hello</Text>;
	}

	const originalWrite = stdout.write;
	// @ts-expect-error - mocking write
	stdout.write = (chunk: string, encoding?: any, cb?: any) => {
		events.push('write');
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		return originalWrite(chunk, encoding, cb);
	};

	render(<App />, {
		stdout,
		debug: true,
		standardReactLayoutTiming: false,
	});

	await delay(0);

	t.is(events[0], 'write');
	t.true(events.includes('effect'));
});
