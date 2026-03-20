/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import process from 'node:process';
import {loadReplay, createHumanReadableDump} from '../src/worker/replay.js';

const filename = process.argv[2];
if (!filename) {
	console.error('Usage: npx tsx dump-replay.ts <replay.json>');
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
}

const replayData = loadReplay(fs.readFileSync(filename, 'utf8'));
const output = createHumanReadableDump(replayData);

const outFilename = filename + '.dump.txt';
fs.writeFileSync(outFilename, output);
console.log(`Successfully dumped replay to ${outFilename}`);
