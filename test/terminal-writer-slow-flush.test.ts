import test from 'ava';
import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {TerminalWriter} from '../src/worker/terminal-writer.js';

const createStyledChar = (char: string): StyledChar => ({
	type: 'char',
	value: char,
	fullWidth: false,
	styles: [],
});

const createLine = (text: string) => ({
	styledChars: [...text].map(char => createStyledChar(char)),
	text,
	length: text.length,
	tainted: true,
});

test('slowFlush is cancelled by flush', async t => {
	const columns = 80;
	const rows = 24;
	const writes: string[] = [];
	const stdout = {
		write(chunk: string) {
			writes.push(chunk);
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);

	// 1. Add multiple chunks to outputBuffer
	// Initial write (Chunk 1)
	const line1 = createLine('Line 1');
	writer.writeLines([line1]);

	// Update (Chunk 2)
	const line1Update = createLine('Line 1 Updated');
	writer.syncLine(line1Update, 0);
	writer.finish();

	// Update (Chunk 3)
	const line1Update2 = createLine('Line 1 Updated Again');
	writer.syncLine(line1Update2, 0);
	writer.finish();

	// Now outputBuffer has 3 chunks.

	// 2. Start slowFlush
	const slowFlushPromise = writer.slowFlush();

	// It should have written the first chunk immediately
	t.is(writes.length, 1);
	t.true(writes[0]!.includes('Line 1'));

	// Wait a bit
	await new Promise(r => setTimeout(r, 30));

	// Still 1 chunk
	t.is(writes.length, 1);

	// 3. Trigger flush (should cancel slowFlush)
	writer.flush();

	// Should have written the rest immediately (merged into one write)
	t.is(writes.length, 2);
	t.true(writes[1]!.includes('Updated'));
	t.true(writes[1]!.includes('Again'));

	// 4. Ensure slowFlush promise resolves
	await slowFlushPromise;

	// 5. Wait more to ensure no phantom writes happen (if cancellation failed)
	await new Promise(r => setTimeout(r, 300));
	t.is(writes.length, 2);
});

test('slowFlush is cancelled by another slowFlush', async t => {
	const columns = 80;
	const rows = 24;
	const writes: string[] = [];
	const stdout = {
		write(chunk: string) {
			writes.push(chunk);
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	const writer = new TerminalWriter(columns, rows, stdout);

	const line1 = createLine('Line 1');
	writer.writeLines([line1]);
	const line1Update = createLine('Line 1 Updated');
	writer.syncLine(line1Update, 0);
	writer.finish();
	const line1Update2 = createLine('Line 1 Updated Again');
	writer.syncLine(line1Update2, 0);
	writer.finish();

	const slowFlushPromise = writer.slowFlush();

	t.is(writes.length, 1);

	await new Promise(r => setTimeout(r, 30));
	t.is(writes.length, 1);

	// Trigger slowFlush again
	await writer.slowFlush();

	// Should have flushed everything (merged into one write)
	t.is(writes.length, 2);
	t.true(writes[1]!.includes('Updated'));
	t.true(writes[1]!.includes('Again'));

	await slowFlushPromise;
});
