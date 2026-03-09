import {type Terminal} from '@xterm/headless';

export function generateSvgForTerminal(terminal: Terminal): string {
	const buffer = terminal.buffer.active;
	const {cols, rows} = terminal;

	const charWidth = 9;
	const charHeight = 17;
	const width = cols * charWidth;
	const height = rows * charHeight;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
	svg += `  <rect width="100%" height="100%" fill="#000" />\n`;
	svg += `  <g font-family="Monaco, Consolas, Courier, monospace" font-size="${charHeight - 2}px">\n`;

	for (let y = 0; y < rows; y++) {
		const line = buffer.getLine(y);
		if (!line) {
			continue;
		}

		for (let x = 0; x < cols; x++) {
			const cell = line.getCell(x);
			if (!cell) {
				continue;
			}

			const char = cell.getChars();
			const fg = cell.getFgColor();
			const bg = cell.getBgColor();
			const bgColor = getCssColor(bg, false);

			if (bgColor !== 'transparent') {
				const xPos = x * charWidth;
				svg += `    <rect x="${xPos}" y="${y * charHeight}" width="${charWidth}" height="${charHeight}" fill="${bgColor}" />\n`;
			}

			if (char === ' ' || char === '') {
				continue;
			}

			// Get styles
			const bold = cell.isBold();
			const italic = cell.isItalic();
			const underline = cell.isUnderline();

			// Convert xterm colors to CSS colors
			const fgColor = getCssColor(fg, true);

			const xPos = x * charWidth;
			const yPos = (y + 1) * charHeight - 4;

			let style = `fill: ${fgColor};`;
			if (bold) {
				style += ' font-weight: bold;';
			}

			if (italic) {
				style += ' font-style: italic;';
			}

			if (underline) {
				style += ' text-decoration: underline;';
			}

			svg += `    <text x="${xPos}" y="${yPos}" style="${style}">${escapeHtml(char)}</text>\n`;
		}
	}

	svg += '  </g>\n</svg>';
	return svg;
}

function getCssColor(color: number, isFg: boolean): string {
	if (color === -1) {
		return isFg ? '#fff' : 'transparent';
	}

	// Standard 16 colors
	const palette = [
		'#000000',
		'#cd0000',
		'#00cd00',
		'#cdcd00',
		'#0000ee',
		'#cd00cd',
		'#00cdcd',
		'#e5e5e5',
		'#7f7f7f',
		'#ff0000',
		'#00ff00',
		'#ffff00',
		'#5c5cff',
		'#ff00ff',
		'#00ffff',
		'#ffffff',
	];

	if (color < 16) {
		return palette[color]!;
	}

	if (color < 256) {
		// 6x6x6 color cube
		if (color >= 16 && color <= 231) {
			const val = color - 16;
			const r = Math.floor(val / 36);
			const g = Math.floor((val % 36) / 6);
			const b = val % 6;
			const conv = (v: number) => (v === 0 ? 0 : v * 40 + 55);
			return `rgb(${conv(r)}, ${conv(g)}, ${conv(b)})`;
		}

		// Greyscale ramp
		if (color >= 232 && color <= 255) {
			const grey = (color - 232) * 10 + 8;
			return `rgb(${grey}, ${grey}, ${grey})`;
		}
	}

	return isFg ? '#fff' : 'transparent';
}

function escapeHtml(text: string): string {
	return text.replaceAll(/[&<>"']/g, m => {
		switch (m) {
			case '&': {
				return '&amp;';
			}

			case '<': {
				return '&lt;';
			}

			case '>': {
				return '&gt;';
			}

			case '"': {
				return '&quot;';
			}

			case "'": {
				return '&#039;';
			}

			default: {
				return m;
			}
		}
	});
}
