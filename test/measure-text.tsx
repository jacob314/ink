import test from 'ava';
import {measureStyledChars, toStyledCharacters} from '../src/measure-text.js';

const measureText = (text: string) =>
	measureStyledChars(toStyledCharacters(text));

test('measure "constructor"', t => {
	const {width} = measureText('constructor');
	t.is(width, 11);
});
