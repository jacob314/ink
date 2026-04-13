import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {render} from './helpers/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('handles fractional layout values without crashing', async t => {
	// A 50.5% width on a 33 width container yields 16.665.
	// If padding calculations use Math.round, this won't crash String.prototype.repeat.
	const {unmount, generateSvg, waitUntilReady} = await render(
		<Box width={33}>
			<Box width="50.5%" paddingLeft={1} paddingTop={1}>
				<Text>Fractional Layout</Text>
			</Box>
		</Box>,
		33,
		{terminalHeight: 5},
	);

	await waitUntilReady();

	const svg = generateSvg();
	const snapshotDir = path.join(__dirname, 'snapshots', 'fractional-layout');
	const snapshotPath = path.join(snapshotDir, 'handles-fractional-layout.svg');

	if (!fs.existsSync(snapshotDir)) {
		fs.mkdirSync(snapshotDir, {recursive: true});
	}

	if (process.env['UPDATE_SNAPSHOTS'] || !fs.existsSync(snapshotPath)) {
		fs.writeFileSync(snapshotPath, svg, 'utf8');
		t.pass();
	} else {
		const expected = fs.readFileSync(snapshotPath, 'utf8');
		t.is(svg, expected);
	}

	await unmount();
});
