import React, {useState, useEffect} from 'react';
import {render, Text, Box, useInput} from '../../src/index.js';
import pkg from '@xterm/headless';
import fs from 'node:fs';
import * as ttyStrings from 'tty-strings';
import defaultStringWidth from 'string-width';
import {tokenize} from '@alcalzone/ansi-tokenize';
import path from 'node:path';
import os from 'node:os';

const logFile = path.join(os.homedir(), 'log.txt');

const {Terminal} = pkg;

const term = new Terminal({
	allowProposedApi: true,
	rows: 80,
	cols: 20
});

const EMOJIS = [
	'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
	'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
	'🏴󠁧󠁢󠁷󠁬󠁳󠁿',
	'🏳️‍🌈',
	'✔️',
	'✔',
	'ℹ',
	'ℹℹℹ',
	'😋',
	'⚠️',
	'ℹ️',
	'✔️',
	'✖️',
	'✅',
	'🦄',
	'✖️',
	'🌈',
	'🌮',
	'🌯',
	'🚀',
	'🌌',
	'🐈',
	'🐕',
	'✨',
	'💖',
	'💕',
	'😂',
	'✅',
	'🎉',
	'🎊',
	'🏳️‍⚧️',
	'🏳️‍⚧️🏳️‍⚧️',
	'🏳️‍🌈🏳️‍🌈',
	'T\tT'
];

import {createStringWidth} from './measure-text.js';

const Emojis = () => {
	const [visibleCount, setVisibleCount] = useState(1);

	useInput(input => {
		if (input === ' ') {
			setVisibleCount(previousCount =>
				Math.min(EMOJIS.length, previousCount + 1),
			);
		}
	});

	return (
		<Box borderStyle="round" width={30} padding={1} flexDirection="column">
			{EMOJIS.slice(0, visibleCount).map((emoji, index) => (
				<Text key={index}>{emoji}123456</Text>
			))}
		</Box>
	);
};

let app: ReturnType<typeof render>;
const stringWidth = createStringWidth(() => app.rerender(<Emojis />));

app = render(<Emojis />, {
	stringWidth,
});