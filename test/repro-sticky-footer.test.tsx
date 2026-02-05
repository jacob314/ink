
import test from 'ava';
import React from 'react';
import {render, Box, Text} from '../src/index.js';
import xtermHeadless from '@xterm/headless';
import delay from 'delay';

const {Terminal: XtermTerminal} = xtermHeadless;

test('sticky footer should be visible when region extends beyond viewport', async t => {
    const columns = 80;
    const rows = 10;
    const term = new XtermTerminal({
        cols: columns,
        rows,
        allowProposedApi: true,
    });

    const stdout = {
        columns,
        rows,
        write(chunk: string) {
            term.write(chunk);
            return true;
        },
        on() {},
        off() {},
        removeListener() {},
        end() {},
        isTTY: true,
    } as unknown as NodeJS.WriteStream;

    const {unmount} = render(
        <Box flexDirection="column" height={20}>
            <Box
                flexDirection="column"
                overflowY="scroll"
                height={15}
                borderStyle="single"
                scrollTop={0}
            >
                <Box flexDirection="column" flexShrink={0}>
                    {Array.from({length: 20}).map((_, i) => (
                        <Text key={i}>Line {i}</Text>
                    ))}
                    <Box sticky="bottom" opaque width="100%">
                        <Text>STICKY FOOTER</Text>
                    </Box>
                </Box>
            </Box>
            <Text>Footer text</Text>
        </Box>,
        {
            stdout,
            terminalBuffer: true,
            patchConsole: false,
        }
    );

    await delay(500);

    let content = '';
    for (let i = 0; i < rows; i++) {
        content += term.buffer.active.getLine(i)?.translateToString(true) + '
';
    }

    t.log('Content:
' + content);
    t.true(content.includes('STICKY FOOTER'), 'Sticky footer should be visible');

    unmount();
});
