/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {measureStyledChars, toStyledCharacters} from '../src/measure-text.js';
import {renderToString} from './helpers/render-to-string.js';

// Test Unicode Mark category (\p{Mark}) support across different scripts
// This ensures combining characters are properly preserved in text rendering

const testCases = [
	{
		name: 'Latin text with combining diacritics',
		text: 'cafe\u0301',
		expectedWidth: 4,
	},
	{
		name: 'Thai text with combining vowels',
		text: 'สวัสดี',
		expectedWidth: 4,
	},
	{
		name: 'Thai text with tone marks',
		text: 'ก่า ก้า ก๊า ก๋า',
		expectedWidth: 11,
	},
	{
		name: 'Arabic text with combining marks',
		text: 'مَرْحَبًا',
		expectedWidth: 5,
	},
	{
		name: 'Hebrew text with combining marks',
		text: 'שָׁלוֹם',
		expectedWidth: 4,
	},
	{
		name: 'mixed scripts with combining marks',
		text: 'Hello café สวัสดี مرحبا',
		expectedWidth: 21,
	},
	{
		name: 'Thai text with sara am',
		text: 'น้ำตาลนำน้ำมาทำงาน',
		expectedWidth: 16,
	},
];

for (const {name, text, expectedWidth} of testCases) {
	test(name, t => {
		const output = renderToString(<Text>{text}</Text>);
		t.is(output, text);

		// Verify that the measured width is correct
		const {width} = measureStyledChars(toStyledCharacters(text));
		t.is(width, expectedWidth);
	});
}

test('Unicode marks in bordered box', t => {
	const textWithMarks = 'café สวัสดี';
	const output = renderToString(
		<Box borderStyle="round">
			<Text>{textWithMarks}</Text>
		</Box>,
	);
	t.true(output.includes(textWithMarks));

	// Verify that the measured width is correct
	const {width} = measureStyledChars(toStyledCharacters(textWithMarks));
	t.is(width, 9);
});

test('Unicode marks wrapping in narrow box', t => {
	// Text with multiple combining marks that should wrap
	const textWithMarks = 'café résumé naïve élève';
	const output = renderToString(
		<Box width={10}>
			<Text>{textWithMarks}</Text>
		</Box>,
	);
	// All combining marks should be preserved
	t.true(output.includes('é'));

	// Verify that the measured width is correct
	const {width} = measureStyledChars(toStyledCharacters(textWithMarks));
	t.is(width, 23);
});
