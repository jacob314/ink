import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

// Test Unicode Mark category (\p{Mark}) support across different scripts
// This ensures combining characters are properly preserved in text rendering

test('Latin text with combining diacritics', t => {
	// Café with combining acute accent (U+0301)
	const latinText = 'cafe\u0301';
	const output = renderToString(<Text>{latinText}</Text>);
	t.is(output, latinText);
});

test('Thai text with combining vowels', t => {
	// สวัสดี contains combining vowels (e.g., U+0E31 is a Thai combining mark)
	const thaiText = 'สวัสดี';
	const output = renderToString(<Text>{thaiText}</Text>);
	t.is(output, thaiText);
});

test('Thai text with tone marks', t => {
	// ก่า ก้า ก๊า ก๋า contains all four Thai tone marks
	const thaiText = 'ก่า ก้า ก๊า ก๋า';
	const output = renderToString(<Text>{thaiText}</Text>);
	t.is(output, thaiText);
});

test('Arabic text with combining marks', t => {
	// Arabic text with diacritics (combining marks)
	const arabicText = 'مَرْحَبًا';
	const output = renderToString(<Text>{arabicText}</Text>);
	t.is(output, arabicText);
});

test('Hebrew text with combining marks', t => {
	// Hebrew with niqqud (vowel points) - combining marks
	const hebrewText = 'שָׁלוֹם';
	const output = renderToString(<Text>{hebrewText}</Text>);
	t.is(output, hebrewText);
});

test('Unicode marks in bordered box', t => {
	const textWithMarks = 'café สวัสดี';
	const output = renderToString(
		<Box borderStyle="round">
			<Text>{textWithMarks}</Text>
		</Box>,
	);
	t.true(output.includes(textWithMarks));
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
});

test('mixed scripts with combining marks', t => {
	const mixedText = 'Hello café สวัสดี مرحبا';
	const output = renderToString(<Text>{mixedText}</Text>);
	t.is(output, mixedText);
});
