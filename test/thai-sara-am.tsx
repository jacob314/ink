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

// Test Thai sara am (ำ, U+0E33) support
// Sara am is a special Thai vowel that appears above the baseline
// It's not in the Unicode Mark category but should still display correctly

const saraAmTestCases = [
	{
		name: 'Thai sara am alone',
		text: 'ำ',
		expectedWidth: 1,
	},
	{
		name: 'Thai word with sara am - นำ (lead/take)',
		text: 'นำ',
		expectedWidth: 2,
	},
	{
		name: 'Thai word with sara am and tone mark - น้ำ (water)',
		text: 'น้ำ',
		expectedWidth: 2,
	},
	{
		name: 'Thai word with sara am - น้ำตาล (sugar)',
		text: 'น้ำตาล',
		expectedWidth: 5,
	},
	{
		name: 'Thai word with sara am - กำลัง (power/strength)',
		text: 'กำลัง',
		expectedWidth: 4, // ก + ำ + ลั + ง = 4 (ั is a combining vowel)
	},
	{
		name: 'Thai word with sara am - ทำงาน (work)',
		text: 'ทำงาน',
		expectedWidth: 5,
	},
	{
		name: 'Thai word with sara am - คำ (word)',
		text: 'คำ',
		expectedWidth: 2,
	},
	{
		name: 'Thai sentence with multiple sara am',
		text: 'กำลังทำงาน',
		expectedWidth: 9,
	},
];

for (const {name, text, expectedWidth} of saraAmTestCases) {
	test(name, t => {
		const output = renderToString(<Text>{text}</Text>);
		t.is(output, text);

		// Verify that the measured width is correct
		const {width} = measureStyledChars(toStyledCharacters(text));
		t.is(width, expectedWidth);
	});
}

test('Thai sara am in bordered box', t => {
	const textWithSaraAm = 'น้ำตาล';
	const output = renderToString(
		<Box borderStyle="round">
			<Text>{textWithSaraAm}</Text>
		</Box>,
	);
	t.true(output.includes(textWithSaraAm));

	// Verify that the measured width is correct
	const {width} = measureStyledChars(toStyledCharacters(textWithSaraAm));
	t.is(width, 5);
});

test('Thai sara am wrapping in narrow box', t => {
	const textWithSaraAm = 'กำลังทำงาน';
	const output = renderToString(
		<Box width={6}>
			<Text>{textWithSaraAm}</Text>
		</Box>,
	);
	// Sara am should be preserved in wrapped text
	t.true(output.includes('ำ'));

	// Verify that the measured width is correct
	const {width} = measureStyledChars(toStyledCharacters(textWithSaraAm));
	t.is(width, 9);
});

test('Thai sara am with fixed width box', t => {
	const textWithSaraAm = 'น้ำ';
	const output = renderToString(
		<Box width={10} borderStyle="single">
			<Text>{textWithSaraAm}</Text>
		</Box>,
	);
	// Text should be preserved correctly
	t.true(output.includes('น้ำ'));
	// Output should contain border characters
	t.true(output.includes('┌'));
	t.true(output.includes('└'));
});

test('Thai sara am character separation', t => {
	// Test that toStyledCharacters correctly separates sara am
	const text = 'น้ำ';
	const chars = toStyledCharacters(text);

	// Should have 2 styled characters:
	// 1. น้ (n + tone mark combined)
	// 2. ำ (sara am)
	t.is(chars.length, 2);
	t.is(chars[0]?.value, 'น้');
	t.is(chars[1]?.value, 'ำ');
});

test('Thai sara am without tone mark', t => {
	// Test that toStyledCharacters correctly handles sara am without tone mark
	const text = 'นำ';
	const chars = toStyledCharacters(text);

	// Should have 2 styled characters:
	// 1. น (n)
	// 2. ำ (sara am)
	t.is(chars.length, 2);
	t.is(chars[0]?.value, 'น');
	t.is(chars[1]?.value, 'ำ');
});

test('Mixed Thai text with sara am and other combining marks', t => {
	const text = 'สวัสดี น้ำ';
	const output = renderToString(<Text>{text}</Text>);
	t.is(output, text);

	// Verify that the measured width is correct
	// สวัสดี = 4, space = 1, น้ำ = 2
	const {width} = measureStyledChars(toStyledCharacters(text));
	t.is(width, 7);
});
