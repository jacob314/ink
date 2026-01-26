import test from 'ava';
import * as dom from '../src/dom.js';
import {
	squashTextNodesWithMap,
	type CharOffsetMap,
} from '../src/squash-text-nodes.js';

test('squash text nodes with map - basic', t => {
	const node = dom.createNode('ink-text');
	const text1 = dom.createTextNode('Hello ');
	const text2 = dom.createTextNode('World');
	dom.appendChildNode(node, text1 as unknown as dom.DOMElement);
	dom.appendChildNode(node, text2 as unknown as dom.DOMElement);

	const map: CharOffsetMap = new Map();
	const offsetRef = {current: 0};
	const text = squashTextNodesWithMap(node, map, offsetRef);

	t.is(text, 'Hello World');
	t.deepEqual(map.get(text1), {start: 0, end: 6});
	t.deepEqual(map.get(text2), {start: 6, end: 11});
});

test('squash text nodes with map - nested', t => {
	const root = dom.createNode('ink-text');
	const text1 = dom.createTextNode('A');
	const nested = dom.createNode('ink-virtual-text');
	const text2 = dom.createTextNode('B');
	const text3 = dom.createTextNode('C');
	dom.appendChildNode(nested, text2 as unknown as dom.DOMElement);
	dom.appendChildNode(nested, text3 as unknown as dom.DOMElement);
	dom.appendChildNode(root, text1 as unknown as dom.DOMElement);
	dom.appendChildNode(root, nested);

	const map: CharOffsetMap = new Map();
	const offsetRef = {current: 0};
	const text = squashTextNodesWithMap(root, map, offsetRef);

	t.is(text, 'ABC');
	t.deepEqual(map.get(text1), {start: 0, end: 1});
	t.deepEqual(map.get(text2), {start: 1, end: 2});
	t.deepEqual(map.get(text3), {start: 2, end: 3});
	t.deepEqual(map.get(nested), {start: 1, end: 3});
});

test('squash text nodes with map - empty', t => {
	const node = dom.createNode('ink-text');
	const map: CharOffsetMap = new Map();
	const offsetRef = {current: 0};
	const text = squashTextNodesWithMap(node, map, offsetRef);

	t.is(text, '');
	t.is(map.size, 0);
});
