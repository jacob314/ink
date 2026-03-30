import {
	FULL_WIDTH_MASK,
	BOLD_MASK,
	DIM_MASK,
	ITALIC_MASK,
	UNDERLINE_MASK,
	STRIKETHROUGH_MASK,
	INVERSE_MASK,
	HIDDEN_MASK,
} from './tokenize.js';

export type StyleSpan = {
	length: number;
	formatFlags: number;
	fgColor?: string;
	bgColor?: string;
	link?: string;
};

export class StyledLine {
	static empty(length: number): StyledLine {
		const line = new StyledLine();
		line.length = length;
		line.text = ' '.repeat(length);
		line.charData = new Uint16Array(Math.max(length, 16));
		for (let i = 0; i < length; i++) {
			line.charData[i] = i;
		}

		line.spans = length > 0 ? [{length, formatFlags: 0}] : [];
		return line;
	}

	public length: number;
	private text: string;
	private charData: Uint16Array;
	private spans: StyleSpan[];

	constructor(values: string[] = [], spans: StyleSpan[] = []) {
		this.length = values.length;
		this.text = values.join('');
		this.charData = new Uint16Array(Math.max(this.length, 16));

		let currentOffset = 0;
		let spanIdx = 0;
		let spanPos = 0;

		for (let i = 0; i < this.length; i++) {
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

		this.spans = spans.map(s => ({
			...s,
			formatFlags: s.formatFlags & ~FULL_WIDTH_MASK,
		}));
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
		const newLen = value.length;

		if (oldLen === newLen) {
			this.text = this.text.slice(0, start) + value + this.text.slice(end);
		} else {
			this.text = this.text.slice(0, start) + value + this.text.slice(end);
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

	slice(start: number, end?: number): StyledLine {
		const actualStart = Math.max(0, start);
		const actualEnd =
			end === undefined ? this.length : Math.min(this.length, end);
		if (actualStart >= actualEnd) return new StyledLine([], []);

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
		const result = new StyledLine();
		result.length = this.length + other.length;
		result.text = this.text + other.text;
		result.charData = new Uint16Array(Math.max(result.length, 16));

		result.charData.set(this.charData.subarray(0, this.length), 0);

		const textOffset = this.text.length;
		for (let i = 0; i < other.length; i++) {
			const oldData = other.charData[i]!;
			const oldOffset = oldData & 0x7f_ff;
			const fw = oldData & 0x80_00;
			result.charData[this.length + i] = (oldOffset + textOffset) | fw;
		}

		result.spans = [...this.spans, ...other.spans.map(s => ({...s}))];
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

export class StyledChar {
	// eslint-disable-next-line max-params
	constructor(
		private readonly _value: string,
		private _formatFlags: number,
		private readonly _fgColor?: string,
		private _bgColor?: string,
		private readonly _link?: string,
	) {}

	getValue() {
		return this._value;
	}

	getFullWidth() {
		return (this._formatFlags & FULL_WIDTH_MASK) !== 0;
	}

	getForegroundColor() {
		return this._fgColor;
	}

	getBackgroundColor() {
		return this._bgColor;
	}

	getBold() {
		return (this._formatFlags & BOLD_MASK) !== 0;
	}

	getDim() {
		return (this._formatFlags & DIM_MASK) !== 0;
	}

	getItalic() {
		return (this._formatFlags & ITALIC_MASK) !== 0;
	}

	getUnderline() {
		return (this._formatFlags & UNDERLINE_MASK) !== 0;
	}

	getStrikethrough() {
		return (this._formatFlags & STRIKETHROUGH_MASK) !== 0;
	}

	getInverse() {
		return (this._formatFlags & INVERSE_MASK) !== 0;
	}

	getHidden() {
		return (this._formatFlags & HIDDEN_MASK) !== 0;
	}

	getLink() {
		return this._link;
	}

	get formatFlags(): number {
		return this._formatFlags;
	}

	get fgColor(): string | undefined {
		return this._fgColor;
	}

	get bgColor(): string | undefined {
		return this._bgColor;
	}

	get link(): string | undefined {
		return this._link;
	}

	setFormatFlag(mask: number): void {
		this._formatFlags |= mask;
	}

	clearFormatFlag(mask: number): void {
		this._formatFlags &= ~mask;
	}

	setBackgroundColor(color: string | undefined): void {
		this._bgColor = color;
	}

	hasStyles(): boolean {
		return (
			(this._formatFlags & ~FULL_WIDTH_MASK) !== 0 ||
			this._fgColor !== undefined ||
			this._bgColor !== undefined ||
			this._link !== undefined
		);
	}

	copyWith(overrides: {value?: string}): StyledChar {
		return new StyledChar(
			overrides.value ?? this._value,
			this._formatFlags,
			this._fgColor,
			this._bgColor,
			this._link,
		);
	}
}
