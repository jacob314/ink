import fs from 'node:fs';
import React, {useEffect} from 'react';
import test from 'ava';
import {render, Box, Text, useApp} from '../src/index.js';

test('dumpCurrentFrame should export snapshot without crashing', async t => {
	const filename = 'test-snapshot-export.json';

	function App() {
		return React.createElement(
			Box,
			null,
			React.createElement(Text, null, 'Hello Snapshot'),
		);
	}

	const instance = render(React.createElement(App), {terminalBuffer: true});

	// Give enough time to render
	await new Promise(resolve => {
		setTimeout(resolve, 500);
	});

	// Test the API correctly exists and executes
	t.notThrows(() => {
		instance.dumpCurrentFrame(filename);
	});

	t.true(fs.existsSync(filename), 'Snapshot JSON file should exist');
	t.true(
		fs.existsSync(filename + '.dump.txt'),
		'Snapshot text dump file should exist',
	);

	// Cleanup
	// if (fs.existsSync(filename)) fs.unlinkSync(filename);
	// if (fs.existsSync(filename + '.dump.txt'))
	//	fs.unlinkSync(filename + '.dump.txt');

	instance.unmount();
});
