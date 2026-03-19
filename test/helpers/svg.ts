import {type Terminal} from '@xterm/headless';

export function generateSvgForTerminal(terminal: Terminal): string {
	const activeBuffer = terminal.buffer.active;

	const getHexColor = (
		isRGB: boolean,
		isPalette: boolean,
		isDefault: boolean,
		colorCode: number,
	): string | undefined => {
		if (isDefault) return null;
		if (isRGB) {
			return `#${colorCode.toString(16).padStart(6, '0')}`;
		}

		if (isPalette) {
			if (colorCode >= 0 && colorCode <= 15) {
				return (
					[
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
					][colorCode] ?? null
				);
			}

			if (colorCode >= 16 && colorCode <= 231) {
				const v = [0, 95, 135, 175, 215, 255];
				const c = colorCode - 16;
				const b = v[c % 6];
				const g = v[Math.floor(c / 6) % 6];
				const r = v[Math.floor(c / 36) % 6];
				return `#${[r, g, b].map(x => x?.toString(16).padStart(2, '0')).join('')}`;
			}

			if (colorCode >= 232 && colorCode <= 255) {
				const gray = 8 + (colorCode - 232) * 10;
				const hex = gray.toString(16).padStart(2, '0');
				return `#${hex}${hex}${hex}`;
			}
		}

		return null;
	};

	const escapeXml = (unsafe: string): string =>
		// eslint-disable-next-line no-control-regex
		unsafe.replaceAll(/[<>&'"\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, c => {
			switch (c) {
				case '<': {
					return '&lt;';
				}

				case '>': {
					return '&gt;';
				}

				case '&': {
					return '&amp;';
				}

				case "'": {
					return '&apos;';
				}

				case '"': {
					return '&quot;';
				}

				default: {
					return '';
				}
			}
		});

	const charWidth = 9;
	const charHeight = 17;
	const padding = 10;

	// Find the actual number of rows with content to avoid rendering trailing blank space.
	let contentRows = terminal.rows;
	for (let y = terminal.rows - 1; y >= 0; y--) {
		const line = activeBuffer.getLine(y);
		if (line && line.translateToString(true).trim().length > 0) {
			contentRows = y + 1;
			break;
		}
	}

	if (contentRows === 0) contentRows = 1; // Minimum 1 row

	const width = terminal.cols * charWidth + padding * 2;
	const height = contentRows * charHeight + padding * 2;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
	svg += `  <style>\n`;
	svg += `    text { font-family: Consolas, "Courier New", monospace; font-size: 14px; dominant-baseline: text-before-edge; white-space: pre; }\n`;
	svg += `  </style>\n`;
	svg += `  <rect width="${width}" height="${height}" fill="#000000" />\n`; // Terminal background
	svg += `  <g transform="translate(${padding}, ${padding})">\n`;

	for (let y = 0; y < contentRows; y++) {
		const line = activeBuffer.getLine(y);
		if (!line) continue;

		let currentFgHex: string | undefined = null;
		let currentBgHex: string | undefined = null;
		let currentIsBold = false;
		let currentIsItalic = false;
		let currentIsUnderline = false;
		let currentBlockStartCol = -1;
		let currentBlockText = '';
		let currentBlockNumCells = 0;

		// eslint-disable-next-line @typescript-eslint/no-loop-func
		const finalizeBlock = (_endCol: number) => {
			if (currentBlockStartCol !== -1 && currentBlockText.length > 0) {
				const xPos = currentBlockStartCol * charWidth;
				const yPos = y * charHeight;

				if (currentBgHex) {
					const rectWidth = currentBlockNumCells * charWidth;
					svg += `    <rect x="${xPos}" y="${yPos}" width="${rectWidth}" height="${charHeight}" fill="${currentBgHex}" />\n`;
				}

				if (currentBlockText.trim().length > 0 || currentIsUnderline) {
					const fill = currentFgHex ?? '#ffffff'; // Default text color
					const textWidth = currentBlockNumCells * charWidth;

					let extraAttrs = '';
					if (currentIsBold) extraAttrs += ' font-weight="bold"';
					if (currentIsItalic) extraAttrs += ' font-style="italic"';
					if (currentIsUnderline) extraAttrs += ' text-decoration="underline"';

					// Use textLength to ensure the block fits exactly into its designated cells
					const textElement = `<text x="${xPos}" y="${yPos + 2}" fill="${fill}" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs"${extraAttrs}>${escapeXml(currentBlockText)}</text>`;

					svg += `    ${textElement}\n`;
				}
			}
		};

		for (let x = 0; x < line.length; x++) {
			const cell = line.getCell(x);
			if (!cell) continue;
			const cellWidth = cell.getWidth();
			if (cellWidth === 0) continue; // Skip continuation cells of wide characters

			let fgHex = getHexColor(
				Boolean(cell.isFgRGB()),
				Boolean(cell.isFgPalette()),
				Boolean(cell.isFgDefault()),
				cell.getFgColor(),
			);
			let bgHex = getHexColor(
				Boolean(cell.isBgRGB()),
				Boolean(cell.isBgPalette()),
				Boolean(cell.isBgDefault()),
				cell.getBgColor(),
			);

			if (cell.isInverse()) {
				const tempFgHex = fgHex;
				fgHex = bgHex ?? '#000000';
				bgHex = tempFgHex ?? '#ffffff';
			}

			const isBold = Boolean(cell.isBold());
			const isItalic = Boolean(cell.isItalic());
			const isUnderline = Boolean(cell.isUnderline());

			let chars = cell.getChars();
			if (chars === '') chars = ' '.repeat(cellWidth);

			if (
				fgHex !== currentFgHex ||
				bgHex !== currentBgHex ||
				isBold !== currentIsBold ||
				isItalic !== currentIsItalic ||
				isUnderline !== currentIsUnderline ||
				currentBlockStartCol === -1
			) {
				finalizeBlock(x);
				currentFgHex = fgHex;
				currentBgHex = bgHex;
				currentIsBold = isBold;
				currentIsItalic = isItalic;
				currentIsUnderline = isUnderline;
				currentBlockStartCol = x;
				currentBlockText = chars;
				currentBlockNumCells = cellWidth;
			} else {
				currentBlockText += chars;
				currentBlockNumCells += cellWidth;
			}
		}

		finalizeBlock(line.length);
	}

	svg += `  </g>\n</svg>`;
	return svg;
}
