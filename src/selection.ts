import {type StyledChar} from '@alcalzone/ansi-tokenize';
import {type DOMNode, type DOMElement, getPathToRoot} from './dom.js';
import {toStyledCharacters} from './measure-text.js';
import {collectSortedFragments} from './measure-element.js';

type PlainTextResultWithMap = {
	styledChars: StyledChar[];
	charOffsetMap: Map<DOMNode, {start: number; end: number}>;
};

const squashNodesWithMap = (
	node: DOMElement,
	map: Map<DOMNode, {start: number; end: number}>,
	offsetRef: {current: number},
): string => {
	let text = '';

	for (const childNode of node.childNodes) {
		let nodeText = '';

		if (childNode.nodeName === '#text') {
			nodeText = childNode.nodeValue;
			map.set(childNode, {
				start: offsetRef.current,
				end: offsetRef.current + nodeText.length,
			});
			offsetRef.current += nodeText.length;
		} else if (
			childNode.nodeName === 'ink-text' ||
			childNode.nodeName === 'ink-virtual-text'
		) {
			nodeText = squashNodesWithMap(childNode, map, offsetRef);
		}

		if (
			nodeText.length > 0 &&
			childNode.nodeName !== '#text' &&
			typeof childNode.internal_transform === 'function'
		) {
			nodeText = childNode.internal_transform(
				nodeText,
				node.childNodes.indexOf(childNode),
			);
		}

		text += nodeText;
	}

	return text;
};

const getPlainTextFromDomNode = (node: DOMNode): PlainTextResultWithMap => {
	const result: PlainTextResultWithMap = {
		styledChars: [],
		charOffsetMap: new Map(),
	};

	if (node.nodeName === '#text') {
		const styledChars = toStyledCharacters(node.nodeValue);
		result.styledChars.push(...styledChars);
		result.charOffsetMap.set(node, {
			start: 0,
			end: styledChars.length,
		});
		return result;
	}

	const {fragments} = collectSortedFragments(node);

	const state = {
		currentX: 0,
		lineBottom: 0,
	};

	for (const fragment of fragments) {
		if (fragment.y >= state.lineBottom) {
			const gap = fragment.y - state.lineBottom;
			const newlines = result.styledChars.length > 0 ? 1 + gap : gap;

			if (newlines > 0) {
				for (let i = 0; i < newlines; i++) {
					result.styledChars.push({
						type: 'char',
						value: '\n',
						fullWidth: false,
						styles: [],
					});
				}

				state.currentX = 0;
			}

			state.lineBottom = fragment.y;
		}

		if (fragment.x > state.currentX) {
			const spaces = fragment.x - state.currentX;
			for (let i = 0; i < spaces; i++) {
				result.styledChars.push({
					type: 'char',
					value: ' ',
					fullWidth: false,
					styles: [],
				});
			}

			state.currentX = fragment.x;
		}

		const styledChars = toStyledCharacters(fragment.text);
		const fragmentStartOffset = result.styledChars.length;
		result.styledChars.push(...styledChars);

		const newlinesInText = (fragment.text.match(/\n/g) ?? []).length;
		if (newlinesInText > 0) {
			const lastNewlineIndex = fragment.text.lastIndexOf('\n');
			state.currentX = fragment.text.length - lastNewlineIndex - 1;
		} else {
			state.currentX += fragment.text.length;
		}

		state.lineBottom = Math.max(state.lineBottom, fragment.y + fragment.height);

		const map = new Map<DOMNode, {start: number; end: number}>();
		const offsetRef = {current: 0};
		squashNodesWithMap(fragment.node, map, offsetRef);

		for (const [n, span] of map) {
			result.charOffsetMap.set(n, {
				start: fragmentStartOffset + span.start,
				end: fragmentStartOffset + span.end,
			});
		}
	}

	result.charOffsetMap.set(node, {start: 0, end: result.styledChars.length});

	return result;
};

export const comparePoints = (
	nodeA: DOMNode,
	offsetA: number,
	nodeB: DOMNode,
	offsetB: number,
): number => {
	if (nodeA === nodeB) {
		return offsetA === offsetB ? 0 : offsetA < offsetB ? -1 : 1;
	}

	const pathA = getPathToRoot(nodeA);
	const pathB = getPathToRoot(nodeB);

	let lca: DOMNode | undefined;
	let i = 0;
	while (i < pathA.length && i < pathB.length && pathA[i] === pathB[i]) {
		lca = pathA[i];
		i++;
	}

	if (!lca) {
		return 0;
	}

	if (i === pathA.length) {
		const childB = pathB[i];
		const indexChildB = (nodeA as DOMElement).childNodes.indexOf(childB!);
		if (offsetA <= indexChildB) return -1;
		return 1;
	}

	if (i === pathB.length) {
		const childA = pathA[i];
		const indexChildA = (nodeB as DOMElement).childNodes.indexOf(childA!);
		if (indexChildA < offsetB) return -1;
		return 1;
	}

	const childA = pathA[i];
	const childB = pathB[i];
	const indexChildA = (lca as DOMElement).childNodes.indexOf(childA!);
	const indexChildB = (lca as DOMElement).childNodes.indexOf(childB!);

	return indexChildA < indexChildB ? -1 : 1;
};

const getRangeCharacterOffsets = (
	range: Range,
	charOffsetMap: Map<DOMNode, {start: number; end: number}>,
): {start: number; end: number} | undefined => {
	if (!range.startContainer || !range.endContainer) {
		return undefined;
	}

	const startContainerOffsets = charOffsetMap.get(range.startContainer);
	const endContainerOffsets = charOffsetMap.get(range.endContainer);

	if (!startContainerOffsets || !endContainerOffsets) {
		return undefined;
	}

	const startIndex = startContainerOffsets.start + range.startOffset;
	const endIndex = endContainerOffsets.start + range.endOffset;

	return {
		start: startIndex,
		end: endIndex,
	};
};

export class Range {
	startContainer: DOMNode | undefined = undefined;
	startOffset = 0;
	endContainer: DOMNode | undefined = undefined;
	endOffset = 0;
	collapsed = true;
	commonAncestorContainer: DOMNode | undefined = undefined;

	setStart(node: DOMNode, offset: number) {
		this.startContainer = node;
		this.startOffset = offset;
		this.updateCollapsed();
		this.updateCommonAncestor();
	}

	setEnd(node: DOMNode, offset: number) {
		this.endContainer = node;
		this.endOffset = offset;
		this.updateCollapsed();
		this.updateCommonAncestor();
	}

	collapse(toStart: boolean) {
		if (toStart) {
			this.endContainer = this.startContainer;
			this.endOffset = this.startOffset;
		} else {
			this.startContainer = this.endContainer;
			this.startOffset = this.endOffset;
		}

		this.collapsed = true;
		this.updateCommonAncestor();
	}

	selectNode(node: DOMNode) {
		if (!node.parentNode) {
			throw new Error('Node has no parent');
		}

		const index = node.parentNode.childNodes.indexOf(node);
		this.setStart(node.parentNode, index);
		this.setEnd(node.parentNode, index + 1);
	}

	selectNodeContents(node: DOMNode) {
		this.setStart(node, 0);
		if (node.nodeName === '#text') {
			this.setEnd(node, node.nodeValue.length);
		} else {
			this.setEnd(node, node.childNodes.length);
		}
	}

	toString(): string {
		if (this.collapsed || !this.startContainer || !this.endContainer) {
			return '';
		}

		if (!this.commonAncestorContainer) {
			return '';
		}

		const {styledChars: fullStyledChars, charOffsetMap} =
			getPlainTextFromDomNode(this.commonAncestorContainer);
		const offsets = getRangeCharacterOffsets(this, charOffsetMap);

		if (!offsets) {
			return '';
		}

		return fullStyledChars
			.slice(offsets.start, offsets.end)
			.map(char => char.value)
			.join('');
	}

	private updateCollapsed() {
		this.collapsed =
			this.startContainer === this.endContainer &&
			this.startOffset === this.endOffset;
	}

	private updateCommonAncestor() {
		if (!this.startContainer || !this.endContainer) {
			this.commonAncestorContainer = undefined;
			return;
		}

		if (this.startContainer === this.endContainer) {
			this.commonAncestorContainer = this.startContainer;
			return;
		}

		const startPath = this.getPath(this.startContainer);
		const endPath = this.getPath(this.endContainer);

		let common: DOMNode | undefined;
		for (let i = 0; i < Math.min(startPath.length, endPath.length); i++) {
			if (startPath[i] === endPath[i]) {
				common = startPath[i]!;
			} else {
				break;
			}
		}

		this.commonAncestorContainer = common;
	}

	private getPath(node: DOMNode): DOMNode[] {
		return getPathToRoot(node);
	}
}

export class Selection {
	anchorNode: DOMNode | undefined = undefined;
	anchorOffset = 0;
	focusNode: DOMNode | undefined = undefined;
	focusOffset = 0;
	isCollapsed = true;
	rangeCount = 0;

	private ranges: Range[] = [];
	private readonly listeners = new Set<() => void>();

	onChange(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	toString(): string {
		return this.ranges.map(range => range.toString()).join('');
	}

	getRangeAt(index: number): Range {
		return this.ranges[index]!;
	}

	addRange(range: Range) {
		if (!this.ranges.includes(range)) {
			this.ranges.push(range);
			this.rangeCount = this.ranges.length;
			if (this.rangeCount === 1) {
				this.anchorNode = range.startContainer;
				this.anchorOffset = range.startOffset;
				this.focusNode = range.endContainer;
				this.focusOffset = range.endOffset;
				this.isCollapsed = range.collapsed;
			}

			this.notifyChange();
		}
	}

	removeRange(range: Range) {
		const index = this.ranges.indexOf(range);
		if (index !== -1) {
			this.ranges.splice(index, 1);
			this.rangeCount = this.ranges.length;
			if (this.rangeCount === 0) {
				this.clearState();
			}

			this.notifyChange();
		}
	}

	removeAllRanges() {
		this.ranges = [];
		this.rangeCount = 0;
		this.clearState();
		this.notifyChange();
	}

	collapse(node: DOMNode, offset: number) {
		this.removeAllRanges();
		const range = new Range();
		range.setStart(node, offset);
		range.setEnd(node, offset);
		this.addRange(range);
	}

	containsNode(node: DOMNode, allowPartialContainment = false): boolean {
		if (!node.parentNode) {
			return false;
		}

		const parent = node.parentNode;
		const index = parent.childNodes.indexOf(node);

		const nodeStartContainer = parent;
		const nodeStartOffset = index;
		const nodeEndContainer = parent;
		const nodeEndOffset = index + 1;

		return this.ranges.some(range => {
			if (!range.startContainer || !range.endContainer) {
				return false;
			}

			const startToStart = comparePoints(
				range.startContainer,
				range.startOffset,
				nodeStartContainer,
				nodeStartOffset,
			);
			const endToEnd = comparePoints(
				range.endContainer,
				range.endOffset,
				nodeEndContainer,
				nodeEndOffset,
			);

			if (allowPartialContainment) {
				const startToEnd = comparePoints(
					range.startContainer,
					range.startOffset,
					nodeEndContainer,
					nodeEndOffset,
				);
				const endToStart = comparePoints(
					range.endContainer,
					range.endOffset,
					nodeStartContainer,
					nodeStartOffset,
				);

				return startToEnd < 0 && endToStart > 0;
			}

			return startToStart <= 0 && endToEnd >= 0;
		});
	}

	private clearState() {
		this.anchorNode = undefined;
		this.anchorOffset = 0;
		this.focusNode = undefined;
		this.focusOffset = 0;
		this.isCollapsed = true;
	}

	private notifyChange() {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
