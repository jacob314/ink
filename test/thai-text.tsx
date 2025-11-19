import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('Thai text with combining vowels', t => {
	// สวัสดี contains combining vowels ั (U+0E31) and ี (U+0E35)
	const thaiText = 'สวัสดี';
	const output = renderToString(<Text>{thaiText}</Text>);
	t.is(output, thaiText);
});

test('Thai text with tone marks', t => {
	// ก่า ก้า contains tone marks ่ (U+0E48) and ้ (U+0E49)
	const thaiText = 'ก่า ก้า';
	const output = renderToString(<Text>{thaiText}</Text>);
	t.is(output, thaiText);
});

test('Thai text with multiple combining characters', t => {
	// เด็ก contains vowel เ (U+0E40), ็ (U+0E47)
	const thaiText = 'เด็ก';
	const output = renderToString(<Text>{thaiText}</Text>);
	t.is(output, thaiText);
});

test('Thai text in bordered box', t => {
	const thaiText = 'สวัสดี';
	const output = renderToString(
		<Box borderStyle="round">
			<Text>{thaiText}</Text>
		</Box>,
	);
	// Should contain the Thai text with all combining characters
	t.true(output.includes(thaiText));
});

test('Thai text wrapping in narrow box', t => {
	// Long Thai text that should wrap
	const thaiText = 'ภาษาไทยเป็นภาษาที่สวยงาม';
	const output = renderToString(
		<Box width={10}>
			<Text>{thaiText}</Text>
		</Box>,
	);
	// Should contain all characters from the original text
	// (though they may be on multiple lines)
	for (const char of thaiText) {
		t.true(output.includes(char), `Output should contain character '${char}'`);
	}
});

test('mixed English and Thai text', t => {
	const mixedText = 'Hello สวัสดี World';
	const output = renderToString(<Text>{mixedText}</Text>);
	t.is(output, mixedText);
});

test('Thai text with all four tone marks', t => {
	// Test all four Thai tone marks
	const thaiText = 'ก่า ก้า ก๊า ก๋า';
	const output = renderToString(<Text>{thaiText}</Text>);
	t.is(output, thaiText);
});
