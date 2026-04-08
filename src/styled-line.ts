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

const OFFSET_MASK = 0x3f_ff_ff_ff;
const FULL_WIDTH_FLAG = 0x40_00_00_00;

export class StyledLine {
	static empty(length: number): StyledLine {
		if (length <= 0) {
			return new StyledLine();
		}

		const cached = StyledLine.emptyCache.get(length);
		if (cached) {
			return cached.clone();
		}

		const line = new StyledLine();
		line.length = length;
		line.text = ' '.repeat(length);
		line.charData = Array.from({length});
		for (let i = 0; i < length; i++) {
			line.charData[i] = i;
		}

		line.spans = [{length, formatFlags: 0}];
		line._cachedTrimmedLength = 0;

		if (StyledLine.emptyCache.size > 100) {
			StyledLine.emptyCache.clear();
		}

		Object.freeze(line.spans[0]);
		Object.freeze(line.spans);
		Object.freeze(line);

		StyledLine.emptyCache.set(length, line);

		return line.clone();
	}

	static legacyCreateStyledLine(
		values: string[] = [],
		spans: StyleSpan[] = [],
	): StyledLine {
		const line = new StyledLine();
		line.applyValuesAndSpans(values, spans);

		return line;
	}

	private static readonly emptyCache = new Map<number, StyledLine>();

	public length: number;
	private text: string | undefined;
	private charData: number[] | undefined;
	private spans: StyleSpan[] | undefined;
	private _cachedTrimmedLength?: number;

	constructor() {
		this.length = 0;
	}

	getValue(index: number): string {
		if (this.text === undefined || index < 0 || index >= this.length) return '';
		const start = this.charData![index]! & OFFSET_MASK;
		const end =
			index + 1 < this.length
				? this.charData![index + 1]! & OFFSET_MASK
				: this.text.length;
		return this.text.slice(start, end);
	}

	getSpan(index: number): StyleSpan | undefined {
		if (this.spans === undefined || index < 0 || index >= this.length)
			return undefined;
		let current = 0;
		for (const span of this.spans) {
			if (index < current + span.length) return span;
			current += span.length;
		}

		return undefined;
	}

	getFullWidth(index: number): boolean {
		if (this.charData === undefined || index < 0 || index >= this.length)
			return false;
		return (this.charData[index]! & FULL_WIDTH_FLAG) !== 0;
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
		this._cachedTrimmedLength = undefined;
		this.ensureInitialized();
		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (const span of this.spans!) {
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
		this._cachedTrimmedLength = undefined;
		this.ensureInitialized();
		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (const span of this.spans!) {
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
		this._cachedTrimmedLength = undefined;
		this.ensureInitialized();
		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (const span of this.spans!) {
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
		this._cachedTrimmedLength = undefined;
		this.ensureInitialized();

		const isFullWidth = (formatFlags & FULL_WIDTH_MASK) !== 0;
		const cleanFormatFlags = formatFlags & ~FULL_WIDTH_MASK;

		const start = this.charData![index]! & OFFSET_MASK;
		const end =
			index + 1 < this.length
				? this.charData![index + 1]! & OFFSET_MASK
				: this.text!.length;
		const oldLen = end - start;
		const newLen = value.length;

		if (oldLen === newLen) {
			this.text = this.text!.slice(0, start) + value + this.text!.slice(end);
		} else {
			this.text = this.text!.slice(0, start) + value + this.text!.slice(end);
			const diff = newLen - oldLen;
			for (let i = index + 1; i < this.length; i++) {
				const data = this.charData![i]!;
				const oldOffset = data & OFFSET_MASK;
				const fw = data & FULL_WIDTH_FLAG;
				this.charData![i] = (oldOffset + diff) | fw;
			}
		}

		this.charData![index] = start | (isFullWidth ? FULL_WIDTH_FLAG : 0);

		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (let i = 0; i < this.spans!.length; i++) {
			const span = this.spans![i]!;
			if (current === index && span.length === 1) {
				this.spans![i] = {
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
		this._cachedTrimmedLength = undefined;
		this.ensureInitialized();
		const isFullWidth = (formatFlags & FULL_WIDTH_MASK) !== 0;
		const cleanFormatFlags = formatFlags & ~FULL_WIDTH_MASK;

		const offset = this.text!.length;
		this.text += value;

		this.charData!.push(offset | (isFullWidth ? FULL_WIDTH_FLAG : 0));

		const lastSpan = this.spans!.at(-1);

		if (
			lastSpan &&
			lastSpan.formatFlags === cleanFormatFlags &&
			lastSpan.fgColor === fgColor &&
			lastSpan.bgColor === bgColor &&
			lastSpan.link === link
		) {
			lastSpan.length++;
		} else {
			this.spans!.push({
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
		if (this.charData === undefined) return new StyledLine();
		const result = new StyledLine();
		result.length = this.length;
		result.text = this.text;
		result.charData = [...this.charData];
		result.spans = this.spans!.map(span => ({...span}));
		result._cachedTrimmedLength = this._cachedTrimmedLength;
		return result;
	}

	slice(start: number, end?: number): StyledLine {
		if (this.charData === undefined) return new StyledLine();
		const actualStart = Math.max(0, start);
		const actualEnd =
			end === undefined ? this.length : Math.min(this.length, end);
		if (actualStart >= actualEnd) return new StyledLine();

		if (actualStart === 0 && actualEnd === this.length) {
			return this.clone();
		}

		const result = new StyledLine();
		result.length = actualEnd - actualStart;
		result.charData = Array.from({length: result.length});

		const textStart = this.charData[actualStart]! & OFFSET_MASK;
		const textEnd =
			actualEnd < this.length
				? this.charData[actualEnd]! & OFFSET_MASK
				: this.text!.length;
		result.text = this.text!.slice(textStart, textEnd);

		for (let i = 0; i < result.length; i++) {
			const oldData = this.charData[actualStart + i]!;
			const oldOffset = oldData & OFFSET_MASK;
			const fw = oldData & FULL_WIDTH_FLAG;
			result.charData[i] = (oldOffset - textStart) | fw;
		}

		const newSpans: StyleSpan[] = [];
		let current = 0;
		for (const span of this.spans!) {
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

	combine(...others: StyledLine[]): StyledLine {
		if (others.length === 0) return this.clone();

		const allLines = [this as StyledLine, ...others].filter(l => l.length > 0);
		if (allLines.length === 0) return new StyledLine();
		if (allLines.length === 1) return allLines[0]!.clone();

		let totalChars = 0;
		for (const line of allLines) {
			totalChars += line.length;
		}

		const result = new StyledLine();
		result.length = totalChars;
		result.text = allLines.map(l => l.getText()).join('');
		result.charData = Array.from({length: totalChars});

		let currentChar = 0;
		let currentOffset = 0;
		for (const line of allLines) {
			const lineCharData = (line as any).charData as number[] | undefined;
			const lineText = line.getText();
			if (lineCharData) {
				for (let i = 0; i < line.length; i++) {
					const data = lineCharData[i]!;
					const offset = data & OFFSET_MASK;
					const fw = data & FULL_WIDTH_FLAG;
					result.charData[currentChar + i] = (currentOffset + offset) | fw;
				}
			} else {
				for (let i = 0; i < line.length; i++) {
					result.charData[currentChar + i] = currentOffset + i;
				}
			}

			currentChar += line.length;
			currentOffset += lineText.length;
		}

		result.spans = allLines.flatMap(l => l.getSpans().map(s => ({...s})));
		result.mergeSpans();
		return result;
	}

	getTrimmedLength(): number {
		if (this.length === 0) return 0;
		if (this.text === undefined || this.charData === undefined) return 0;

		let currentIdx = this.length - 1;

		if (this.spans) {
			for (let s = this.spans.length - 1; s >= 0; s--) {
				const span = this.spans[s]!;
				const hasStyles =
					(span.formatFlags & ~FULL_WIDTH_MASK) !== 0 ||
					span.fgColor !== undefined ||
					span.bgColor !== undefined ||
					span.link !== undefined;

				if (hasStyles) {
					return currentIdx + 1;
				}

				for (let i = 0; i < span.length; i++) {
					const start = this.charData[currentIdx]! & OFFSET_MASK;
					const end =
						currentIdx + 1 < this.length
							? this.charData[currentIdx + 1]! & OFFSET_MASK
							: this.text.length;

					if (end - start !== 1 || this.text[start] !== ' ') {
						return currentIdx + 1;
					}

					currentIdx--;
				}
			}
		}

		return 0;
	}

	trimEnd(): StyledLine {
		const trimmedLength = this.getTrimmedLength();
		if (trimmedLength === this.length) return this;
		if (trimmedLength === 0) return new StyledLine();
		return this.slice(0, trimmedLength);
	}

	equals(other: StyledLine): boolean {
		if (this.length !== other.length) return false;
		if (this.length === 0) return true;
		if (this.getText() !== other.getText()) return false;
		const s1 = this.getSpans();
		const s2 = other.getSpans();
		if (s1.length !== s2.length) return false;

		for (let i = 0; i < s1.length; i++) {
			const sp1 = s1[i]!;
			const sp2 = s2[i]!;
			if (
				sp1.length !== sp2.length ||
				sp1.formatFlags !== sp2.formatFlags ||
				sp1.fgColor !== sp2.fgColor ||
				sp1.bgColor !== sp2.bgColor ||
				sp1.link !== sp2.link
			) {
				return false;
			}
		}

		const thisCharData = this.charData;
		const otherCharData = (other as any).charData as number[] | undefined;
		if (thisCharData && otherCharData) {
			for (let i = 0; i < this.length; i++) {
				if (thisCharData[i] !== otherCharData[i]) return false;
			}
		}

		return true;
	}

	getText(): string {
		return this.text ?? '';
	}

	getSpans(): StyleSpan[] {
		return this.spans ?? [];
	}

	getValues(): string[] {
		return Array.from({length: this.length}, (_, i) => this.getValue(i));
	}

	*[Symbol.iterator]() {
		if (this.length === 0) return;
		let currentSpanIdx = 0;
		let currentSpanPos = 0;
		const spans = this.getSpans();

		for (let i = 0; i < this.length; i++) {
			const span = spans[currentSpanIdx];
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

	private ensureInitialized() {
		if (this.charData === undefined) {
			this.text = '';
			this.charData = Array.from({length: this.length});
			this.spans =
				this.length > 0 ? [{length: this.length, formatFlags: 0}] : [];
			if (this.length > 0 && this.text.length === 0) {
				this.text = ' '.repeat(this.length);
				for (let i = 0; i < this.length; i++) {
					this.charData[i] = i;
				}
			}
		}
	}

	private applyValuesAndSpans(values: string[], spans: StyleSpan[]) {
		this._cachedTrimmedLength = undefined;
		const visibleChars = values.length;

		this.length = visibleChars;
		this.text = values.join('');
		this.charData = Array.from({length: this.length});

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

			this.charData[i] = currentOffset | (isFullWidth ? FULL_WIDTH_FLAG : 0);
			currentOffset += val.length;
		}

		this.spans = spans.map(s => ({
			...s,
			formatFlags: s.formatFlags & ~FULL_WIDTH_MASK,
		}));

		this.mergeSpans();
	}

	private splitSpansAt(index: number) {
		if (this.spans === undefined || index <= 0 || index >= this.length) return;
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
		if (this.spans === undefined) return;
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
