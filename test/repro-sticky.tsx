/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import test from 'ava';
import {Box, Text} from '../src/index.js';
import {renderToString} from './helpers/render-to-string.js';

test('nested scrollable sticky header position', t => {
    // Outer Box with some height to push the inner scrollable down
    const output = renderToString(
        <Box flexDirection="column" width={100} height={40}>
            <Box height={10} flexDirection="column">
                <Text>Spacer Line 0</Text>
                <Text>Spacer Line 1</Text>
                <Text>Spacer Line 2</Text>
                <Text>Spacer Line 3</Text>
                <Text>Spacer Line 4</Text>
                <Text>Spacer Line 5</Text>
                <Text>Spacer Line 6</Text>
                <Text>Spacer Line 7</Text>
                <Text>Spacer Line 8</Text>
                <Text>Spacer Line 9</Text>
            </Box>
            <Box
                height={10}
                width={50}
                overflowY="scroll"
                scrollTop={5}
                borderStyle="single"
            >
                <Box flexDirection="column" flexShrink={0}>
                    <Box sticky opaque height={1} key="sticky">
                        <Text>STICKY HEADER</Text>
                    </Box>
                    {Array.from({length: 50}).map((_, i) => (
                        <Text key={i}>Line {i + 1}</Text>
                    ))}
                </Box>
            </Box>
        </Box>
    );

    const lines = output.split('\n');
    
    // Expected:
    // Rows 0-9: Spacer lines
    // Row 10: Top border of inner box
    // Row 11: STICKY HEADER (if correctly positioned)
    
    const foundRow = lines.findIndex(line => line.includes('STICKY HEADER'));
    t.is(foundRow, 11, `Expected STICKY HEADER at row 11, but found at row ${foundRow}. Output row 11: "${lines[11]}"`);
});
