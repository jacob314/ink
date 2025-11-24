import test from 'ava';
import Output from '../src/output.js';

test('removes trailing unstyled spaces from styledOutput', t => {
	const output = new Output({width: 10, height: 2});

	// Write "Hello" at 0,0
	output.write(0, 0, 'Hello', {transformers: []});

	const result = output.get();

	// Row 0 should be trimmed to "Hello" (length 5)
	// Currently it would be 10
	t.is(result.styledOutput[0].length, 5, 'Row 0 should have length 5');
	t.is(result.styledOutput[0][4].value, 'o');

	// Row 1 should be empty (length 0)
	t.is(result.styledOutput[1].length, 0, 'Row 1 should have length 0');
});
