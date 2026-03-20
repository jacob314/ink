export type AnsiCode = {
	type: 'ansi';
	code: string;
	endCode: string;
};

export type CssStyles = {
	color?: string;
	backgroundColor?: string;
	fontWeight?: string;
	fontStyle?: string;
	textDecoration?: string;
	opacity?: string;
	inverse?: boolean;
};

const ansiColors = [
	'#000000', // Black
	'#aa0000', // Red
	'#00aa00', // Green
	'#aa5500', // Yellow
	'#0000aa', // Blue
	'#aa00aa', // Magenta
	'#00aaaa', // Cyan
	'#aaaaaa', // White
	'#555555', // Bright black
	'#ff5555', // Bright red
	'#55ff55', // Bright green
	'#ffff55', // Bright yellow
	'#5555ff', // Bright blue
	'#ff55ff', // Bright magenta
	'#55ffff', // Bright cyan
	'#ffffff', // Bright white
];

function parse256(n: number) {
	if (n < 16) {
		return ansiColors[n];
	}

	if (n < 232) {
		n -= 16;
		const r = Math.floor(n / 36);
		const g = Math.floor((n % 36) / 6);
		const b = n % 6;
		return `rgb(${r ? r * 40 + 55 : 0}, ${g ? g * 40 + 55 : 0}, ${b ? b * 40 + 55 : 0})`;
	}

	const v = (n - 232) * 10 + 8;
	return `rgb(${v}, ${v}, ${v})`;
}

export function ansiToCss(ansiCodes: AnsiCode[]): CssStyles {
	const css: CssStyles = {};
	for (const {code} of ansiCodes) {
		// eslint-disable-next-line no-control-regex
		const match = /\u001B\[([\d;]+)m/.exec(code);
		if (!match) {
			continue;
		}

		const params = match[1]!.split(';');
		for (let i = 0; i < params.length; i++) {
			const p = Number.parseInt(params[i]!, 10);
			switch (p) {
				case 1: {
					css.fontWeight = 'bold';
					break;
				}

				case 2: {
					css.opacity = '0.5';
					break;
				}

				case 3: {
					css.fontStyle = 'italic';
					break;
				}

				case 4: {
					css.textDecoration = css.textDecoration
						? css.textDecoration + ' underline'
						: 'underline';
					break;
				}

				case 7: {
					css.inverse = true;
					break;
				}

				case 9: {
					css.textDecoration = css.textDecoration
						? css.textDecoration + ' line-through'
						: 'line-through';
					break;
				}

				default: {
					if (p >= 30 && p <= 37) {
						css.color = ansiColors[p - 30];
					} else if (p >= 40 && p <= 47) {
						css.backgroundColor = ansiColors[p - 40];
					} else if (p >= 90 && p <= 97) {
						css.color = ansiColors[p - 90 + 8];
					} else if (p >= 100 && p <= 107) {
						css.backgroundColor = ansiColors[p - 100 + 8];
					} else if (p === 38 || p === 48) {
						const isFg = p === 38;
						if (params[i + 1] === '5') {
							const color = parse256(Number.parseInt(params[i + 2]!, 10));
							if (isFg) {
								css.color = color;
							} else {
								css.backgroundColor = color;
							}

							i += 2;
						} else if (params[i + 1] === '2') {
							const r = params[i + 2];
							const g = params[i + 3];
							const b = params[i + 4];
							const color = `rgb(${r}, ${g}, ${b})`;
							if (isFg) {
								css.color = color;
							} else {
								css.backgroundColor = color;
							}

							i += 4;
						}
					}

					break;
				}
			}
		}
	}

	if (css.inverse) {
		const fg = css.color ?? 'var(--fg-color)';
		const bg = css.backgroundColor ?? 'var(--bg-color)';
		css.color = bg;
		css.backgroundColor = fg;
	}

	return css;
}

export function cssObjToString(css: CssStyles) {
	let str = '';
	if (css.color) {
		str += `color: ${css.color};`;
	}

	if (css.backgroundColor) {
		str += `background-color: ${css.backgroundColor};`;
	}

	if (css.fontWeight) {
		str += `font-weight: ${css.fontWeight};`;
	}

	if (css.fontStyle) {
		str += `font-style: ${css.fontStyle};`;
	}

	if (css.textDecoration) {
		str += `text-decoration: ${css.textDecoration};`;
	}

	if (css.opacity) {
		str += `opacity: ${css.opacity};`;
	}

	return str;
}
