import {Buffer} from 'node:buffer';
import type {StyledChar, AnsiCode} from '@alcalzone/ansi-tokenize';

// Constants for binary format
const hasStylesMask = 0b0000_0010;
const fullWidthMask = 0b0000_0001;

export class Serializer {
	// eslint-disable-next-line @typescript-eslint/ban-types
	private buffer: Buffer;
	private currentSize = 0;

	constructor(initialSize = 1024 * 1024) {
		this.buffer = Buffer.allocUnsafe(initialSize);
	}

	serialize(lines: StyledChar[][]): Uint8Array {
		this.currentSize = 0;
		this.writeUint32(lines.length);
		for (const line of lines) {
			this.writeLine(line);
		}

		const result = Buffer.allocUnsafe(this.currentSize);
		this.buffer.copy(result, 0, 0, this.currentSize);
		return result;
	}

	private ensureCapacity(size: number) {
		if (this.currentSize + size > this.buffer.length) {
			const newSize = Math.max(
				this.buffer.length * 2,
				this.currentSize + size + 1024 * 1024,
			);
			const newBuffer = Buffer.allocUnsafe(newSize);
			this.buffer.copy(newBuffer, 0, 0, this.currentSize);
			this.buffer = newBuffer;
		}
	}

	private writeLine(line: StyledChar[]) {
		if (line.length === 0) {
			this.writeUint32(0);
			return;
		}

		let spanCount = 0;
		for (let i = 0; i < line.length; i++) {
			if (i === 0 || !this.isSameStyle(line[i - 1]!, line[i]!)) {
				spanCount++;
			}
		}

		this.writeUint32(spanCount);

		let currentSpanStart = 0;
		for (let i = 1; i <= line.length; i++) {
			if (i === line.length || !this.isSameStyle(line[i - 1]!, line[i]!)) {
				this.writeSpan(line, currentSpanStart, i);
				currentSpanStart = i;
			}
		}
	}

	private isSameStyle(charA: StyledChar, charB: StyledChar): boolean {
		const stylesA = charA.styles;
		const stylesB = charB.styles;

		if (stylesA.length !== stylesB.length) {
			return false;
		}

		for (const [i, styleA] of stylesA.entries()) {
			const styleB = stylesB[i]!;

			if (styleA.code !== styleB.code || styleA.endCode !== styleB.endCode) {
				return false;
			}
		}

		return true;
	}

	private writeSpan(line: StyledChar[], start: number, end: number) {
		const spanLength = end - start;
		this.writeUint32(spanLength);

		const firstChar = line[start]!;

		let flags = 0;
		if (firstChar.styles.length > 0) {
			// eslint-disable-next-line no-bitwise
			flags |= hasStylesMask;
		}

		this.writeUint8(flags);

		// eslint-disable-next-line no-bitwise
		if (flags & hasStylesMask) {
			this.writeUint8(firstChar.styles.length);
			for (const style of firstChar.styles) {
				this.writeAnsiCode(style);
			}
		}

		for (let i = start; i < end; i++) {
			const char = line[i]!;
			let charFlags = 0;
			if (char.fullWidth) {
				// eslint-disable-next-line no-bitwise
				charFlags |= fullWidthMask;
			}

			this.writeUint8(charFlags);
			this.writeString(char.value || '');
		}
	}

	private writeAnsiCode(code: AnsiCode) {
		this.writeString(code.code);
		this.writeString(code.endCode);
	}

	private writeString(str: string) {
		const len = Buffer.byteLength(str);
		this.ensureCapacity(2 + len);
		this.buffer.writeUint16LE(len, this.currentSize);
		this.currentSize += 2;
		this.buffer.write(str, this.currentSize, len, 'utf8');
		this.currentSize += len;
	}

	private writeUint32(value: number) {
		this.ensureCapacity(4);
		this.buffer.writeUint32LE(value, this.currentSize);
		this.currentSize += 4;
	}

	private writeUint8(value: number) {
		this.ensureCapacity(1);
		this.buffer.writeUint8(value, this.currentSize);
		this.currentSize += 1;
	}
}

export class Deserializer {
	private offset = 0;
	// eslint-disable-next-line @typescript-eslint/ban-types
	private readonly buf: Buffer;

	constructor(buffer: Uint8Array) {
		this.buf = Buffer.isBuffer(buffer)
			? buffer
			: Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}

	deserialize(): StyledChar[][] {
		const lineCount = this.readUint32();
		const lines: StyledChar[][] = [];

		for (let i = 0; i < lineCount; i++) {
			lines.push(this.readLine());
		}

		return lines;
	}

	private readLine(): StyledChar[] {
		const spanCount = this.readUint32();
		const line: StyledChar[] = [];

		for (let i = 0; i < spanCount; i++) {
			this.readSpan(line);
		}

		return line;
	}

	private readSpan(line: StyledChar[]) {
		const spanLength = this.readUint32();
		const flags = this.readUint8();
		// eslint-disable-next-line no-bitwise
		const hasStyles = (flags & hasStylesMask) !== 0;

		const styles: AnsiCode[] = [];

		if (hasStyles) {
			const styleCount = this.readUint8();
			for (let i = 0; i < styleCount; i++) {
				styles.push(this.readAnsiCode());
			}
		}

		for (let i = 0; i < spanLength; i++) {
			const charFlags = this.readUint8();
			// eslint-disable-next-line no-bitwise
			const fullWidth = (charFlags & fullWidthMask) !== 0;
			const value = this.readString();

			line.push({
				type: 'char',
				value,
				fullWidth,
				styles,
			});
		}
	}

	private readAnsiCode(): AnsiCode {
		const code = this.readString();
		const endCode = this.readString();
		return {
			type: 'ansi',
			code,
			endCode,
		};
	}

	private readString(): string {
		const len = this.readUint16();
		const str = this.buf.toString('utf8', this.offset, this.offset + len);
		this.offset += len;
		return str;
	}

	private readUint32(): number {
		const value = this.buf.readUint32LE(this.offset);
		this.offset += 4;
		return value;
	}

	private readUint16(): number {
		const value = this.buf.readUint16LE(this.offset);
		this.offset += 2;
		return value;
	}

	private readUint8(): number {
		const value = this.buf.readUint8(this.offset);
		this.offset += 1;
		return value;
	}
}
