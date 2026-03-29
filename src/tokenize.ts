import isFullwidthCodePoint from 'is-fullwidth-code-point';
import ansiStyles from 'ansi-styles';

// --- consts.ts ---
const BEL = '\u0007';
const ESC = '\u001B';
const BACKSLASH = '\\';
const CSI = '[';
const OSC = ']';
const C1_ST = '\u009C';

export const CC_BEL = BEL.charCodeAt(0);
export const CC_ESC = ESC.charCodeAt(0);
export const CC_BACKSLASH = BACKSLASH.charCodeAt(0);
export const CC_CSI = CSI.charCodeAt(0);
export const CC_OSC = OSC.charCodeAt(0);
export const CC_C1_ST = C1_ST.charCodeAt(0);
export const CC_0 = '0'.charCodeAt(0);
export const CC_9 = '9'.charCodeAt(0);
export const CC_SEMI = ';'.charCodeAt(0);
export const CC_M = 'm'.charCodeAt(0);

export const ESCAPES = new Set([CC_ESC, 0x9b]);

export const linkCodePrefix = `${ESC}${OSC}8;`;
export const linkCodePrefixCharCodes = [...linkCodePrefix].map(char =>
	char.charCodeAt(0),
);
export const linkCodeSuffix = BEL;
export const linkEndCode = `${ESC}${OSC}8;;${BEL}`;
export const linkEndCodeST = `${ESC}${OSC}8;;${ESC}${BACKSLASH}`;
export const linkEndCodeC1ST = `${ESC}${OSC}8;;${C1_ST}`;

// --- ansiCodes.ts ---
export const endCodesSet = new Set<string>();
const endCodesMap = new Map<string, string>();
for (const [start, end] of ansiStyles.codes) {
	endCodesSet.add(ansiStyles.color.ansi(end));
	endCodesMap.set(ansiStyles.color.ansi(start), ansiStyles.color.ansi(end));
}

export function getEndCode(code: string): string {
	if (endCodesSet.has(code)) return code;
	if (endCodesMap.has(code)) return endCodesMap.get(code)!;

	if (code.startsWith(linkCodePrefix)) {
		if (code.endsWith('\u001B\\')) return linkEndCodeST;
		if (code.endsWith('\u009C')) return linkEndCodeC1ST;
		return linkEndCode;
	}

	code = code.slice(2);

	if (code.startsWith('38')) {
		return ansiStyles.color.close;
	}

	if (code.startsWith('48')) {
		return ansiStyles.bgColor.close;
	}

	const ret = ansiStyles.codes.get(Number.parseInt(code, 10));
	if (ret) {
		return ansiStyles.color.ansi(ret);
	}

	return ansiStyles.reset.open;
}

export function isIntensityCode(code: AnsiCode): boolean {
	return (
		code.code === ansiStyles.bold.open || code.code === ansiStyles.dim.open
	);
}

// --- tokenize.ts ---
export type AnsiCode = {
	type: 'ansi';
	code: string;
	endCode: string;
};

export type ControlCode = {
	type: 'control';
	code: string;
};

export type Char = {
	type: 'char';
	value: string;
	fullWidth: boolean;
};

export type Token = AnsiCode | ControlCode | Char;

function findOSCTerminatorIndex(string: string, startIndex: number): number {
	for (let i = startIndex; i < string.length; i++) {
		const ch = string.charCodeAt(i);
		if (ch === CC_BEL) return i;
		if (ch === CC_C1_ST) return i;
		if (
			ch === CC_ESC &&
			i + 1 < string.length &&
			string.charCodeAt(i + 1) === CC_BACKSLASH
		) {
			return i + 1;
		}
	}

	return -1;
}

function parseLinkCode(string: string, offset: number): string | undefined {
	string = string.slice(offset);
	for (let index = 1; index < linkCodePrefixCharCodes.length; index++) {
		if (string.charCodeAt(index) !== linkCodePrefixCharCodes[index]) {
			return undefined;
		}
	}

	const paramsEndIndex = string.indexOf(';', linkCodePrefix.length);
	if (paramsEndIndex === -1) return undefined;
	const endIndex = findOSCTerminatorIndex(string, paramsEndIndex + 1);
	if (endIndex === -1) return undefined;

	return string.slice(0, endIndex + 1);
}

function parseOSCSequence(string: string, offset: number): string | undefined {
	string = string.slice(offset);
	const endIndex = findOSCTerminatorIndex(string, 2);
	if (endIndex === -1) return undefined;
	return string.slice(0, endIndex + 1);
}

function findSGRSequenceEndIndex(str: string): number {
	for (let index = 2; index < str.length; index++) {
		const charCode = str.charCodeAt(index);
		if (charCode === CC_M) return index;
		if (charCode === CC_SEMI) continue;
		if (charCode >= CC_0 && charCode <= CC_9) continue;
		break;
	}

	return -1;
}

function parseSGRSequence(string: string, offset: number): string | undefined {
	string = string.slice(offset);
	const endIndex = findSGRSequenceEndIndex(string);
	if (endIndex === -1) return;

	return string.slice(0, endIndex + 1);
}

function splitCompoundSGRSequences(code: string): string[] {
	if (!code.includes(';')) {
		return [code];
	}

	const codeParts = code.slice(2, -1).split(';');

	const ret: string[] = [];
	for (let i = 0; i < codeParts.length; i++) {
		const rawCode = codeParts[i];
		if (rawCode === '38' || rawCode === '48') {
			if (i + 2 < codeParts.length && codeParts[i + 1] === '5') {
				ret.push(codeParts.slice(i, i + 3).join(';'));
				i += 2;
				continue;
			} else if (i + 4 < codeParts.length && codeParts[i + 1] === '2') {
				ret.push(codeParts.slice(i, i + 5).join(';'));
				i += 4;
				continue;
			}
		}

		ret.push(rawCode!);
	}

	return ret.map(part => `\u001B[${part}m`);
}

export function tokenize(
	str: string,
	endChar: number = Number.POSITIVE_INFINITY,
): Token[] {
	const ret: Token[] = [];
	let visible = 0;
	let i = 0;

	while (i < str.length) {
		// Determine the next code point / surrogate pair string
		const codePoint = str.codePointAt(i)!;
		// If it's a surrogate pair, it will be 2 characters long
		const charLength = codePoint > 0xff_ff ? 2 : 1;
		const charStr = str.slice(i, i + charLength);

		if (ESCAPES.has(codePoint)) {
			let code: string | undefined;

			const nextCodePoint = str.codePointAt(i + 1);
			if (nextCodePoint === CC_OSC) {
				code = parseLinkCode(str, i);
				if (code) {
					ret.push({
						type: 'ansi',
						code,
						endCode: getEndCode(code),
					});
				} else {
					code = parseOSCSequence(str, i);
					if (code) {
						ret.push({
							type: 'control',
							code,
						});
					}
				}
			} else if (nextCodePoint === CC_CSI) {
				code = parseSGRSequence(str, i);
				if (code) {
					const codes = splitCompoundSGRSequences(code);
					for (const individualCode of codes) {
						ret.push({
							type: 'ansi',
							code: individualCode,
							endCode: getEndCode(individualCode),
						});
					}
				}
			}

			if (code) {
				i += code.length;
				continue;
			}
		}

		// Variation Selector 16 forces emoji presentation (2 columns wide)
		const isVariationSelector = charStr.includes('\uFE0F');
		// Regional indicator pairs form flag emoji (2 columns wide)
		const isRegionalIndicator =
			codePoint >= 0x1_f1_e6 && codePoint <= 0x1_f1_ff;

		const fullWidth =
			isVariationSelector ||
			isRegionalIndicator ||
			isFullwidthCodePoint(codePoint);

		ret.push({
			type: 'char',
			value: charStr,
			fullWidth,
		});

		visible += fullWidth ? 2 : 1;

		if (visible >= endChar) {
			break;
		}

		i += charLength;
	}

	return ret;
}

// --- StyledChar.ts ---
export const BOLD_MASK = Math.trunc(1);
export const DIM_MASK = 1 << 1;
export const ITALIC_MASK = 1 << 2;
export const UNDERLINE_MASK = 1 << 3;
export const STRIKETHROUGH_MASK = 1 << 4;
export const INVERSE_MASK = 1 << 5;
export const HIDDEN_MASK = 1 << 6;
export const FULL_WIDTH_MASK = 1 << 7;

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
		// If there are any formatting flags (except FULL_WIDTH) or any color/link set.
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

// --- styledCharsFromTokens.ts ---
export function styledCharsFromTokens(tokens: Token[]): StyledChar[] {
	const ret: StyledChar[] = [];

	let formatFlags = 0;
	let fgColor: string | undefined;
	let bgColor: string | undefined;
	let link: string | undefined;

	for (const token of tokens) {
		if (token.type === 'ansi') {
			const {code} = token;
			switch (code) {
				case ansiStyles.reset.open: {
					formatFlags = 0;
					fgColor = undefined;
					bgColor = undefined;
					link = undefined;

					break;
				}

				case ansiStyles.bold.open: {
					formatFlags |= BOLD_MASK;

					break;
				}

				case ansiStyles.dim.open: {
					formatFlags |= DIM_MASK;

					break;
				}

				case ansiStyles.italic.open: {
					formatFlags |= ITALIC_MASK;

					break;
				}

				case ansiStyles.underline.open: {
					formatFlags |= UNDERLINE_MASK;

					break;
				}

				case ansiStyles.strikethrough.open: {
					formatFlags |= STRIKETHROUGH_MASK;

					break;
				}

				case ansiStyles.inverse.open: {
					formatFlags |= INVERSE_MASK;

					break;
				}

				case ansiStyles.hidden.open: {
					formatFlags |= HIDDEN_MASK;

					break;
				}

				case ansiStyles.bold.close:
				case ansiStyles.dim.close: {
					// 22m closes both bold and dim
					formatFlags &= ~BOLD_MASK;
					formatFlags &= ~DIM_MASK;

					break;
				}

				case ansiStyles.italic.close: {
					formatFlags &= ~ITALIC_MASK;

					break;
				}

				case ansiStyles.underline.close: {
					formatFlags &= ~UNDERLINE_MASK;

					break;
				}

				case ansiStyles.strikethrough.close: {
					formatFlags &= ~STRIKETHROUGH_MASK;

					break;
				}

				case ansiStyles.inverse.close: {
					formatFlags &= ~INVERSE_MASK;

					break;
				}

				case ansiStyles.hidden.close: {
					formatFlags &= ~HIDDEN_MASK;

					break;
				}

				default: {
					if (
						code.startsWith('\u001B[38;') ||
						(code >= '\u001B[30m' && code <= '\u001B[37m') ||
						(code >= '\u001B[90m' && code <= '\u001B[97m')
					) {
						fgColor = code;
					} else if (
						code.startsWith('\u001B[48;') ||
						(code >= '\u001B[40m' && code <= '\u001B[47m') ||
						(code >= '\u001B[100m' && code <= '\u001B[107m')
					) {
						bgColor = code;
					} else if (code === ansiStyles.color.close) {
						fgColor = undefined;
					} else if (code === ansiStyles.bgColor.close) {
						bgColor = undefined;
					} else if (code.startsWith(linkCodePrefix)) {
						link = code;
					} else if (
						code === linkEndCode ||
						code === linkEndCodeST ||
						code === linkEndCodeC1ST
					) {
						link = undefined;
					}
				}
			}
		} else if (token.type === 'char') {
			let finalFlags = formatFlags;
			if (token.fullWidth) {
				finalFlags |= FULL_WIDTH_MASK;
			}

			ret.push(new StyledChar(token.value, finalFlags, fgColor, bgColor, link));
		}
	}

	return ret;
}

// --- styledCharsToString.ts ---
export function styledCharsToString(chars: StyledChar[]): string {
	let ret = '';

	let prevFormatFlags = 0;
	let prevFgColor: string | undefined;
	let prevBgColor: string | undefined;
	let prevLink: string | undefined;

	for (let i = 0; i < chars.length; i++) {
		const char = chars[i]!;
		const {formatFlags} = char;
		const {fgColor} = char;
		const {bgColor} = char;
		const {link} = char;
		// Fast path: if styling matches previous char, just append value.
		if (
			formatFlags === prevFormatFlags &&
			fgColor === prevFgColor &&
			bgColor === prevBgColor &&
			link === prevLink
		) {
			ret += char.getValue();
			continue;
		}

		// If bold or dim changed to false, we have to emit reset (22m), which resets both.
		// So if we need to restore one, we have to emit it again.
		let needResetBoldDim = false;
		if (
			(prevFormatFlags & BOLD_MASK && !(formatFlags & BOLD_MASK)) ||
			(prevFormatFlags & DIM_MASK && !(formatFlags & DIM_MASK))
		) {
			needResetBoldDim = true;
		}

		if (fgColor !== prevFgColor) {
			ret += fgColor === undefined ? ansiStyles.color.close : fgColor;
		}

		if (bgColor !== prevBgColor) {
			ret += bgColor === undefined ? ansiStyles.bgColor.close : bgColor;
		}

		if (needResetBoldDim) {
			ret += ansiStyles.bold.close; // 22m closes both
		}

		if (
			(needResetBoldDim ||
				(formatFlags & BOLD_MASK && !(prevFormatFlags & BOLD_MASK))) &&
			formatFlags & BOLD_MASK
		)
			ret += ansiStyles.bold.open;

		if (
			(needResetBoldDim ||
				(formatFlags & DIM_MASK && !(prevFormatFlags & DIM_MASK))) &&
			formatFlags & DIM_MASK
		)
			ret += ansiStyles.dim.open;
		if (formatFlags & ITALIC_MASK && !(prevFormatFlags & ITALIC_MASK))
			ret += ansiStyles.italic.open;
		if (!(formatFlags & ITALIC_MASK) && prevFormatFlags & ITALIC_MASK)
			ret += ansiStyles.italic.close;

		if (formatFlags & UNDERLINE_MASK && !(prevFormatFlags & UNDERLINE_MASK))
			ret += ansiStyles.underline.open;
		if (!(formatFlags & UNDERLINE_MASK) && prevFormatFlags & UNDERLINE_MASK)
			ret += ansiStyles.underline.close;

		if (
			formatFlags & STRIKETHROUGH_MASK &&
			!(prevFormatFlags & STRIKETHROUGH_MASK)
		)
			ret += ansiStyles.strikethrough.open;
		if (
			!(formatFlags & STRIKETHROUGH_MASK) &&
			prevFormatFlags & STRIKETHROUGH_MASK
		)
			ret += ansiStyles.strikethrough.close;

		if (formatFlags & INVERSE_MASK && !(prevFormatFlags & INVERSE_MASK))
			ret += ansiStyles.inverse.open;
		if (!(formatFlags & INVERSE_MASK) && prevFormatFlags & INVERSE_MASK)
			ret += ansiStyles.inverse.close;

		if (formatFlags & HIDDEN_MASK && !(prevFormatFlags & HIDDEN_MASK))
			ret += ansiStyles.hidden.open;
		if (!(formatFlags & HIDDEN_MASK) && prevFormatFlags & HIDDEN_MASK)
			ret += ansiStyles.hidden.close;

		if (needResetBoldDim) {
			ret += ansiStyles.bold.close; // 22m closes both
		}

		if (fgColor !== prevFgColor && fgColor === undefined) {
			ret += ansiStyles.color.close;
		}

		if (bgColor !== prevBgColor && bgColor === undefined) {
			ret += ansiStyles.bgColor.close;
		}

		if (link !== prevLink) {
			ret += link === undefined ? linkEndCode : link;
		}

		ret += char.getValue();

		prevFormatFlags = formatFlags;
		prevFgColor = fgColor;
		prevBgColor = bgColor;
		prevLink = link;
	}

	// Reset active styles at the end of the string
	if (prevFgColor !== undefined) ret += ansiStyles.color.close;
	if (prevBgColor !== undefined) ret += ansiStyles.bgColor.close;
	if (prevFormatFlags & (BOLD_MASK | DIM_MASK)) ret += ansiStyles.bold.close;
	if (prevFormatFlags & ITALIC_MASK) ret += ansiStyles.italic.close;
	if (prevFormatFlags & UNDERLINE_MASK) ret += ansiStyles.underline.close;
	if (prevFormatFlags & STRIKETHROUGH_MASK)
		ret += ansiStyles.strikethrough.close;
	if (prevFormatFlags & INVERSE_MASK) ret += ansiStyles.inverse.close;
	if (prevFormatFlags & HIDDEN_MASK) ret += ansiStyles.hidden.close;
	if (prevLink !== undefined) ret += linkEndCode;

	return ret;
}
