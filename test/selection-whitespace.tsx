import React from 'react';
import test from 'ava';
import {Box, Text, getText, render, type DOMElement} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';
import {CaptureRoot} from './helpers/capture-root.js';

test('getText includes whitespace from padding and layout', t => {
	let capturedText = '';

	const onCapture = (node: DOMElement) => {
		capturedText = getText(node);
	};

	const stdout = createStdout();
	render(
		<CaptureRoot
			flexDirection="column"
			borderStyle="single"
			padding={1}
			onCapture={onCapture}
		>
			<Box paddingLeft={2}>
				<Text>Indented</Text>
			</Box>
			<Text>Normal</Text>
		</CaptureRoot>,
		{stdout, debug: true},
	);

	// Wait for effect to run.
	// Since render is synchronous for the initial render, capturedText should be populated.

	// If not, we might need a small delay.

	t.true(capturedText.length > 0, 'Should have captured text');

	// Expected behavior:
	// Top border (1 line) ->

	// Padding top (1 line) ->

	// Indented line: Border (1 char) + Padding (1 char) + Indent (2 chars) + Text -> "    Indented"
	// Normal line: Border (1 char) + Padding (1 char) + Text -> "  Normal"
	// Padding bottom (1 line) ->

	// Bottom border (1 line) ->

	// Current getText likely returns: "Indented\nNormal"

	// We check if it contains the indentation.
	// We use regex to be flexible about newlines for now, but strict about indentation.

	// Check for "   Indented" (3 spaces)
	const indentedMatch = / {3}Indented/.test(capturedText);
	// Check for " Normal" (1 space)
	const normalMatch = capturedText.includes(' Normal');

	if (!indentedMatch || !normalMatch) {
		t.log('Captured text:', JSON.stringify(capturedText));
	}

	t.true(
		indentedMatch,
		'Should have 3 spaces indentation (1 border + 1 padding + 2 inner padding - 1 offset?)',
	);
	t.true(
		normalMatch,
		'Should have 1 space indentation (1 border + 1 padding - 1 offset?)',
	);
});
