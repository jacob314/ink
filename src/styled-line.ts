/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {FULL_WIDTH_MASK, INVERSE_MASK} from './tokenize.js';

export type StyleSpan = {
	length: number;
	formatFlags: number;
	fgColor?: string;
	bgColor?: string;
	link?: string;
};

const MAX_SAFE_OFFSET = 0x7f_ff;

export class StyledLine {
	static empty(length: number): StyledLine {
		const safeLength = Math.min(length, MAX_SAFE_OFFSET);
		const line = new StyledLine();
		line.length = safeLength;
		line.text = ' '.repeat(safeLength);
		line.charData = new Uint16Array(Math.max(safeLength, 16));
		for (let i = 0; i < safeLength; i++) {
			line.charData[i] = i;
		}

		line.spans = safeLength > 0 ? [{length: safeLength, formatFlags: 0}] : [];
		return line;
	}

	public length: number;
	private text: string;
	private charData: Uint16Array;
	private spans: StyleSpan[];

	constructor(values: string[] = [], spans: StyleSpan[] = []) {
		let totalTextLen = 0;
		let visibleChars = 0;
		for (const val of values) {
			if (totalTextLen + val.length > MAX_SAFE_OFFSET - 1) {
				break;
			}

			totalTextLen += val.length;
			visibleChars++;
		}

		const truncated = visibleChars < values.length;
		this.length = visibleChars + (truncated ? 1 : 0);
		this.text = values.slice(0, visibleChars).join('') + (truncated ? '…' : '');
		this.charData = new Uint16Array(Math.max(this.length, 16));

		let currentOffset = 0;
		let spanIdx = 0;
		let spanPos = 0;

		for (let i = 0; i < visibleChars; i++) {
			const val = values[i]!;
			let isFullWidth = false;

			if (spans.length > 0 && spanIdx < spans.length) {
				const span = spans[spanIdx]!;
				if ((span.formatFlags & FULL_WIDTH_MASK) !== 0) {
					isFullWidth = true;
				}

				spanPos++;
				if (spanPos >= span.length) {
					spanIdx++;
					spanPos = 0;
				}
			}

			this.charData[i] = currentOffset | (isFullWidth ? 0x80_00 : 0);
			currentOffset += val.length;
		}

		if (truncated) {
			this.charData[visibleChars] = currentOffset;
		}

		if (truncated) {
			const newSpans: StyleSpan[] = [];
			let remaining = visibleChars;
			let sIdx = 0;
			while (remaining > 0 && sIdx < spans.length) {
				const span = spans[sIdx]!;
				const take = Math.min(remaining, span.length);
				newSpans.push({...span, length: take});
				remaining -= take;
				sIdx++;
			}

			newSpans.push({length: 1, formatFlags: 0});
			this.spans = newSpans;
		} else {
			this.spans = spans.map(s => ({
				...s,
				formatFlags: s.formatFlags & ~FULL_WIDTH_MASK,
			}));
		}

		this.mergeSpans();
	}

	getValue(index: number): string {
		if (index < 0 || index >= this.length) return '';
		const start = this.charData[index]! & 0x7f_ff;
		const end =
			index + 1 < this.length
				? this.charData[index + 1]! & 0x7f_ff
				: this.text.length;
		return this.text.slice(start, end);
	}

	getSpan(index: number): StyleSpan | undefined {
		if (index < 0 || index >= this.length) return undefined;
		let current = 0;
		for (const span of this.spans) {
			if (index < current + span.length) return span;
			current += span.length;
		}

		return undefined;
	}

	getFullWidth(index: number): boolean {
		if (index < 0 || index >= this.length) return false;
		return (this.charData[index]! & 0x80_00) !== 0;
	}

	hasStyles(index: number): boolean {
		const span = this.getSpan(index);
		if (!span) return false;
		return (
			(span.formatFlags & ~FULL_WIDTH_MASK) !== 0 ||
			span.fgColor !== undefined ||
			span.bgColor !== undefined ||
			span.link !== undefined
		);
	}

	getFormatFlags(index: number): number {
		let flags = this.getSpan(index)?.formatFlags ?? 0;
		if (this.getFullWidth(index)) {
			flags |= FULL_WIDTH_MASK;
		}

		return flags;
	}

	getFgColor(index: number): string | undefined {
		return this.getSpan(index)?.fgColor;
	}

	getBgColor(index: number): string | undefined {
		return this.getSpan(index)?.bgColor;
	}

	getLink(index: number): string | undefined {
		return this.getSpan(index)?.link;
	}

	setInverted(index: number, inverted: boolean) {
		if (index < 0 || index >= this.length) return;
		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (const span of this.spans) {
			if (current === index && span.length === 1) {
				if (inverted) {
					span.formatFlags |= INVERSE_MASK;
				} else {
					span.formatFlags &= ~INVERSE_MASK;
				}

				break;
			}

			current += span.length;
		}

		this.mergeSpans();
	}

	setBackgroundColor(index: number, color: string | undefined) {
		if (index < 0 || index >= this.length) return;
		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (const span of this.spans) {
			if (current === index && span.length === 1) {
				span.bgColor = color;
				break;
			}

			current += span.length;
		}

		this.mergeSpans();
	}

	setForegroundColor(index: number, color: string | undefined) {
		if (index < 0 || index >= this.length) return;
		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (const span of this.spans) {
			if (current === index && span.length === 1) {
				span.fgColor = color;
				break;
			}

			current += span.length;
		}

		this.mergeSpans();
	}

	// eslint-disable-next-line max-params
	setChar(
		index: number,
		value: string,
		formatFlags: number,
		fgColor?: string,
		bgColor?: string,
		link?: string,
	) {
		if (index < 0 || index >= this.length) return;

		const isFullWidth = (formatFlags & FULL_WIDTH_MASK) !== 0;
		const cleanFormatFlags = formatFlags & ~FULL_WIDTH_MASK;

		const start = this.charData[index]! & 0x7f_ff;
		const end =
			index + 1 < this.length
				? this.charData[index + 1]! & 0x7f_ff
				: this.text.length;
		const oldLen = end - start;

		let newValue = value;
		if (this.text.length - oldLen + value.length > MAX_SAFE_OFFSET) {
			newValue = value.slice(
				0,
				Math.max(0, MAX_SAFE_OFFSET - (this.text.length - oldLen)),
			);
		}

		const newLen = newValue.length;

		if (oldLen === newLen) {
			this.text = this.text.slice(0, start) + newValue + this.text.slice(end);
		} else {
			this.text = this.text.slice(0, start) + newValue + this.text.slice(end);
			const diff = newLen - oldLen;
			for (let i = index + 1; i < this.length; i++) {
				const data = this.charData[i]!;
				const oldOffset = data & 0x7f_ff;
				const fw = data & 0x80_00;
				this.charData[i] = (oldOffset + diff) | fw;
			}
		}

		this.charData[index] = start | (isFullWidth ? 0x80_00 : 0);

		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (let i = 0; i < this.spans.length; i++) {
			const span = this.spans[i]!;
			if (current === index && span.length === 1) {
				this.spans[i] = {
					length: 1,
					formatFlags: cleanFormatFlags,
					fgColor,
					bgColor,
					link,
				};
				break;
			}

			current += span.length;
		}

		this.mergeSpans();
	}

	// eslint-disable-next-line max-params
	pushChar(
		value: string,
		formatFlags: number,
		fgColor?: string,
		bgColor?: string,
		link?: string,
	) {
		const isFullWidth = (formatFlags & FULL_WIDTH_MASK) !== 0;
		const cleanFormatFlags = formatFlags & ~FULL_WIDTH_MASK;

		const offset = this.text.length;
		if (value !== '…' && offset + value.length > MAX_SAFE_OFFSET - 1) {
			if (offset < MAX_SAFE_OFFSET && !this.text.endsWith('…')) {
				this.pushChar('…', formatFlags, fgColor, bgColor, link);
			}

			return;
		}

		if (offset + value.length > MAX_SAFE_OFFSET) {
			return;
		}

		this.text += value;

		if (this.length >= this.charData.length) {
			const newData = new Uint16Array(this.charData.length * 2 || 16);
			newData.set(this.charData);
			this.charData = newData;
		}

		this.charData[this.length] = offset | (isFullWidth ? 0x80_00 : 0);

		const lastSpan = this.spans.at(-1);

		if (
			lastSpan &&
			lastSpan.formatFlags === cleanFormatFlags &&
			lastSpan.fgColor === fgColor &&
			lastSpan.bgColor === bgColor &&
			lastSpan.link === link
		) {
			lastSpan.length++;
		} else {
			this.spans.push({
				length: 1,
				formatFlags: cleanFormatFlags,
				fgColor,
				bgColor,
				link,
			});
		}

		this.length++;
	}

	clone(): StyledLine {
		const result = new StyledLine();
		result.length = this.length;
		result.text = this.text;
		result.charData = this.charData.slice(0, Math.max(this.length, 16));
		result.spans = this.spans.map(span => ({...span}));
		return result;
	}

	slice(start: number, end?: number): StyledLine {
		const actualStart = Math.max(0, start);
		const actualEnd =
			end === undefined ? this.length : Math.min(this.length, end);
		if (actualStart >= actualEnd) return new StyledLine([], []);

		if (actualStart === 0 && actualEnd === this.length) {
			return this.clone();
		}

		const result = new StyledLine();
		result.length = actualEnd - actualStart;
		result.charData = new Uint16Array(Math.max(result.length, 16));

		const textStart = this.charData[actualStart]! & 0x7f_ff;
		const textEnd =
			actualEnd < this.length
				? this.charData[actualEnd]! & 0x7f_ff
				: this.text.length;
		result.text = this.text.slice(textStart, textEnd);

		for (let i = 0; i < result.length; i++) {
			const oldData = this.charData[actualStart + i]!;
			const oldOffset = oldData & 0x7f_ff;
			const fw = oldData & 0x80_00;
			result.charData[i] = (oldOffset - textStart) | fw;
		}

		const newSpans: StyleSpan[] = [];
		let current = 0;
		for (const span of this.spans) {
			const spanStart = current;
			const spanEnd = current + span.length;

			const intersectStart = Math.max(actualStart, spanStart);
			const intersectEnd = Math.min(actualEnd, spanEnd);

			if (intersectStart < intersectEnd) {
				newSpans.push({
					...span,
					length: intersectEnd - intersectStart,
				});
			}

			current += span.length;
			if (current >= actualEnd) break;
		}

		result.spans = newSpans;
		result.mergeSpans();
		return result;
	}

	concat(other: StyledLine): StyledLine {
		const spaceForOther = MAX_SAFE_OFFSET - 1 - this.text.length;
		if (spaceForOther <= 0) {
			if (this.text.length < MAX_SAFE_OFFSET && !this.text.endsWith('…')) {
				const result = this.clone();
				result.pushChar('…', 0);
				return result;
			}

			return this.clone();
		}

		let otherTextLenToTake = 0;
		let otherCharsToTake = 0;
		for (let i = 0; i < other.length; i++) {
			const val = other.getValue(i);
			if (otherTextLenToTake + val.length > spaceForOther) {
				break;
			}

			otherTextLenToTake += val.length;
			otherCharsToTake++;
		}

		const truncated = otherCharsToTake < other.length;
		const result = new StyledLine();
		result.length = this.length + otherCharsToTake + (truncated ? 1 : 0);
		result.text =
			this.text +
			other.text.slice(0, otherTextLenToTake) +
			(truncated ? '…' : '');
		result.charData = new Uint16Array(Math.max(result.length, 16));

		result.charData.set(this.charData.subarray(0, this.length), 0);

		const textOffset = this.text.length;
		for (let i = 0; i < otherCharsToTake; i++) {
			const oldData = other.charData[i]!;
			const oldOffset = oldData & 0x7f_ff;
			const fw = oldData & 0x80_00;
			result.charData[this.length + i] = (oldOffset + textOffset) | fw;
		}

		if (truncated) {
			result.charData[this.length + otherCharsToTake] =
				this.text.length + otherTextLenToTake;
		}

		const otherSpans: StyleSpan[] = [];
		let remaining = otherCharsToTake;
		for (const span of other.spans) {
			if (remaining <= 0) break;
			const take = Math.min(remaining, span.length);
			otherSpans.push({...span, length: take});
			remaining -= take;
		}

		result.spans = [...this.spans, ...otherSpans];
		if (truncated) {
			result.spans.push({length: 1, formatFlags: 0});
		}

		result.mergeSpans();
		return result;
	}

	trimEnd(): StyledLine {
		let i = this.length - 1;
		while (i >= 0 && this.getValue(i) === ' ' && !this.hasStyles(i)) {
			i--;
		}

		return this.slice(0, i + 1);
	}

	equals(other: StyledLine): boolean {
		if (this.length !== other.length) return false;
		if (this.text !== other.text) return false;
		if (this.spans.length !== other.spans.length) return false;

		for (let i = 0; i < this.spans.length; i++) {
			const s1 = this.spans[i]!;
			const s2 = other.spans[i]!;
			if (
				s1.length !== s2.length ||
				s1.formatFlags !== s2.formatFlags ||
				s1.fgColor !== s2.fgColor ||
				s1.bgColor !== s2.bgColor ||
				s1.link !== s2.link
			) {
				return false;
			}
		}

		for (let i = 0; i < this.length; i++) {
			if (this.charData[i] !== other.charData[i]) return false;
		}

		return true;
	}

	getText(): string {
		return this.text;
	}

	getSpans(): StyleSpan[] {
		return this.spans;
	}

	getValues(): string[] {
		return Array.from({length: this.length}, (_, i) => this.getValue(i));
	}

	*[Symbol.iterator]() {
		let currentSpanIdx = 0;
		let currentSpanPos = 0;

		for (let i = 0; i < this.length; i++) {
			const span = this.spans[currentSpanIdx];
			const formatFlags = span ? span.formatFlags : 0;
			const isFullWidth = this.getFullWidth(i);

			yield {
				value: this.getValue(i),
				formatFlags: formatFlags | (isFullWidth ? FULL_WIDTH_MASK : 0),
				fgColor: span?.fgColor,
				bgColor: span?.bgColor,
				link: span?.link,
				fullWidth: isFullWidth,
				hasStyles:
					(formatFlags & ~FULL_WIDTH_MASK) !== 0 ||
					span?.fgColor !== undefined ||
					span?.bgColor !== undefined ||
					span?.link !== undefined,
			};

			if (span) {
				currentSpanPos++;
				if (currentSpanPos >= span.length) {
					currentSpanIdx++;
					currentSpanPos = 0;
				}
			}
		}
	}

	private splitSpansAt(index: number) {
		if (index <= 0 || index >= this.length) return;
		let current = 0;
		for (let i = 0; i < this.spans.length; i++) {
			const span = this.spans[i]!;
			if (index > current && index < current + span.length) {
				const leftLen = index - current;
				const rightLen = span.length - leftLen;
				this.spans.splice(
					i,
					1,
					{...span, length: leftLen},
					{...span, length: rightLen},
				);
				return;
			}

			current += span.length;
		}
	}

	private mergeSpans() {
		const newSpans: StyleSpan[] = [];
		for (const span of this.spans) {
			if (span.length === 0) continue;
			const last = newSpans.at(-1);
			if (
				last &&
				last.formatFlags === span.formatFlags &&
				last.fgColor === span.fgColor &&
				last.bgColor === span.bgColor &&
				last.link === span.link
			) {
				last.length += span.length;
			} else {
				newSpans.push({...span});
			}
		}

		this.spans = newSpans;
	}
}
