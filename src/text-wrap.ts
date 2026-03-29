import {StyledLine} from './styled-line.js';
import {inkCharacterWidth, styledCharsWidth} from './measure-text.js';

export const sliceStyledChars = (
	line: StyledLine,
	begin: number,
	end?: number,
): StyledLine => {
	let width = 0;
	let startIndex = -1;
	let endIndex = line.length;

	for (let i = 0; i < line.length; i++) {
		const charWidth = inkCharacterWidth(line.getValue(i));
		const charStart = width;
		const charEnd = width + charWidth;

		if (end !== undefined && charEnd > end) {
			endIndex = i;
			break;
		}

		if (charStart >= begin && startIndex === -1) {
			startIndex = i;
		}

		width += charWidth;
	}

	if (startIndex === -1) return new StyledLine();
	return line.slice(startIndex, endIndex);
};

export const truncateStyledChars = (
	line: StyledLine,
	columns: number,
	options: {position?: 'start' | 'middle' | 'end'} = {},
): StyledLine => {
	const {position = 'end'} = options;
	const truncationCharacter = '…';
	const truncationStyledLine = new StyledLine();
	truncationStyledLine.pushChar(truncationCharacter, 0);

	if (columns < 1) {
		return new StyledLine();
	}

	if (columns === 1) {
		return truncationStyledLine;
	}

	const textWidth = styledCharsWidth(line);

	if (textWidth <= columns) {
		return line;
	}

	const truncationWidth = inkCharacterWidth(truncationCharacter);

	if (position === 'start') {
		const right = sliceStyledChars(
			line,
			textWidth - columns + truncationWidth,
			textWidth,
		);
		return new StyledLine(
			[...truncationStyledLine.getValues(), ...right.getValues()],
			[
				...truncationStyledLine.getSpans(),
				...right.getSpans().map(s => ({...s})),
			],
		);
	}

	if (position === 'middle') {
		const leftWidth = Math.ceil(columns / 2);
		const rightWidth = columns - leftWidth;
		const left = sliceStyledChars(line, 0, leftWidth - truncationWidth);
		const right = sliceStyledChars(line, textWidth - rightWidth, textWidth);
		return new StyledLine(
			[
				...left.getValues(),
				...truncationStyledLine.getValues(),
				...right.getValues(),
			],
			[
				...left.getSpans(),
				...truncationStyledLine.getSpans().map(s => ({...s})),
				...right.getSpans().map(s => ({...s})),
			],
		);
	}

	const left = sliceStyledChars(line, 0, columns - truncationWidth);
	return new StyledLine(
		[...left.getValues(), ...truncationStyledLine.getValues()],
		[...left.getSpans(), ...truncationStyledLine.getSpans().map(s => ({...s}))],
	);
};

const wrapWord = (rows: StyledLine[], word: StyledLine, columns: number) => {
	let currentLine = rows.at(-1)!;
	let visible = styledCharsWidth(currentLine);

	for (let i = 0; i < word.length; i++) {
		const val = word.getValue(i);
		const flags = word.getFormatFlags(i);
		const fg = word.getFgColor(i);
		const bg = word.getBgColor(i);
		const link = word.getLink(i);

		const characterLength = inkCharacterWidth(val);

		if (visible + characterLength > columns && visible > 0) {
			rows.push(new StyledLine());
			currentLine = rows.at(-1)!;
			visible = styledCharsWidth(currentLine);
		}

		currentLine.pushChar(val, flags, fg, bg, link);
		visible += characterLength;
	}
};

export const wrapStyledChars = (
	line: StyledLine,
	columns: number,
): StyledLine[] => {
	const rows: StyledLine[] = [new StyledLine()];
	const words: StyledLine[] = [];
	let currentWord = new StyledLine();

	for (let i = 0; i < line.length; i++) {
		const val = line.getValue(i);
		const flags = line.getFormatFlags(i);
		const fg = line.getFgColor(i);
		const bg = line.getBgColor(i);
		const link = line.getLink(i);

		if (val === '\n' || val === ' ') {
			if (currentWord.length > 0) {
				words.push(currentWord);
			}

			currentWord = new StyledLine();
			const spaceLine = new StyledLine();
			spaceLine.pushChar(val, flags, fg, bg, link);
			words.push(spaceLine);
		} else {
			currentWord.pushChar(val, flags, fg, bg, link);
		}
	}

	if (currentWord.length > 0) {
		words.push(currentWord);
	}

	let isAtStartOfLogicalLine = true;

	for (const word of words) {
		if (word.length === 0) {
			continue;
		}

		if (word.getValue(0) === '\n') {
			rows.push(new StyledLine());
			isAtStartOfLogicalLine = true;
			continue;
		}

		const wordWidth = styledCharsWidth(word);
		const rowWidth = styledCharsWidth(rows.at(-1)!);

		if (rowWidth + wordWidth > columns) {
			if (
				!isAtStartOfLogicalLine &&
				word.getValue(0) === ' ' &&
				word.length === 1
			) {
				continue;
			}

			if (!isAtStartOfLogicalLine) {
				while (
					rows.at(-1)!.length > 0 &&
					rows.at(-1)!.getValue(rows.at(-1)!.length - 1) === ' '
				) {
					rows[rows.length - 1] = rows
						.at(-1)!
						.slice(0, rows.at(-1)!.length - 1);
				}
			}

			if (wordWidth > columns) {
				if (rowWidth > 0) {
					rows.push(new StyledLine());
				}

				wrapWord(rows, word, columns);
			} else {
				rows.push(new StyledLine());
				// eslint-disable-next-line unicorn/prefer-spread
				rows[rows.length - 1] = rows.at(-1)!.concat(word);
			}
		} else {
			// eslint-disable-next-line unicorn/prefer-spread
			rows[rows.length - 1] = rows.at(-1)!.concat(word);
		}

		if (
			isAtStartOfLogicalLine &&
			!(word.getValue(0) === ' ' && word.length === 1)
		) {
			isAtStartOfLogicalLine = false;
		}
	}

	return rows;
};

export const wrapOrTruncateStyledChars = (
	line: StyledLine,
	maxWidth: number,
	textWrap = 'wrap',
): StyledLine[] => {
	if (textWrap.startsWith('truncate')) {
		let position: 'start' | 'middle' | 'end' = 'end';
		if (textWrap === 'truncate-middle') {
			position = 'middle';
		} else if (textWrap === 'truncate-start') {
			position = 'start';
		}

		return [truncateStyledChars(line, maxWidth, {position})];
	}

	return wrapStyledChars(line, maxWidth);
};
