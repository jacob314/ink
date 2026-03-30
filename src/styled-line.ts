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
	public length: number;
	private values: string[];
	private spans: StyleSpan[];

	constructor(values: string[] = [], spans: StyleSpan[] = []) {
		this.values = values;
		this.spans = spans;
		this.length = values.length;
	}

	static empty(length: number): StyledLine {
		const values = Array.from({length}).map(() => ' ');
		const spans = length > 0 ? [{length, formatFlags: 0}] : [];
		return new StyledLine(values, spans);
	}

	getValue(index: number): string {
		return this.values[index] ?? '';
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
		return ((this.getSpan(index)?.formatFlags ?? 0) & FULL_WIDTH_MASK) !== 0;
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
		return this.getSpan(index)?.formatFlags ?? 0;
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

	setChar(
		index: number,
		value: string,
		formatFlags: number,
		fgColor?: string,
		bgColor?: string,
		link?: string,
	) {
		if (index < 0 || index >= this.length) return;

		this.values[index] = value;

		this.splitSpansAt(index);
		this.splitSpansAt(index + 1);

		let current = 0;
		for (let i = 0; i < this.spans.length; i++) {
			const span = this.spans[i]!;
			if (current === index && span.length === 1) {
				this.spans[i] = {length: 1, formatFlags, fgColor, bgColor, link};
				break;
			}

			current += span.length;
		}

		this.mergeSpans();
	}

	pushChar(
		value: string,
		formatFlags: number,
		fgColor?: string,
		bgColor?: string,
		link?: string,
	) {
		this.values.push(value);
		const lastSpan = this.spans.at(-1);

		if (
			lastSpan &&
			lastSpan.formatFlags === formatFlags &&
			lastSpan.fgColor === fgColor &&
			lastSpan.bgColor === bgColor &&
			lastSpan.link === link
		) {
			lastSpan.length++;
		} else {
			this.spans.push({length: 1, formatFlags, fgColor, bgColor, link});
		}

		this.length++;
	}

	slice(start: number, end?: number): StyledLine {
		const actualStart = Math.max(0, start);
		const actualEnd =
			end === undefined ? this.length : Math.min(this.length, end);
		if (actualStart >= actualEnd) return new StyledLine([], []);

		const newValues = this.values.slice(actualStart, actualEnd);
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

		const result = new StyledLine(newValues, newSpans);
		result.mergeSpans();
		return result;
	}

	concat(other: StyledLine): StyledLine {
		const newValues = [...this.values, ...other.values];
		const newSpans = [...this.spans, ...other.spans.map(s => ({...s}))];
		const result = new StyledLine(newValues, newSpans);
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
			)
				return false;
		}

		for (let i = 0; i < this.length; i++) {
			if (this.values[i] !== other.values[i]) return false;
		}

		return true;
	}

	getSpans(): StyleSpan[] {
		return this.spans;
	}

	getValues(): string[] {
		return this.values;
	}

	*[Symbol.iterator]() {
		let currentSpanIdx = 0;
		let currentSpanPos = 0;

		for (let i = 0; i < this.length; i++) {
			const span = this.spans[currentSpanIdx]!;
			yield {
				value: this.values[i]!,
				formatFlags: span.formatFlags,
				fgColor: span.fgColor,
				bgColor: span.bgColor,
				link: span.link,
				fullWidth: (span.formatFlags & FULL_WIDTH_MASK) !== 0,
				hasStyles:
					(span.formatFlags & ~FULL_WIDTH_MASK) !== 0 ||
					span.fgColor !== undefined ||
					span.bgColor !== undefined ||
					span.link !== undefined,
			};

			currentSpanPos++;
			if (currentSpanPos >= span.length) {
				currentSpanIdx++;
				currentSpanPos = 0;
			}
		}
	}
}

export class StyledChar {
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
