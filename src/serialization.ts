import {Buffer} from 'node:buffer';
import type {StyledChar, AnsiCode} from '@alcalzone/ansi-tokenize';

// Constants for binary format
const HAS_STYLES_MASK = 0b0000_0010;
const FULL_WIDTH_MASK = 0b0000_0001;

export class Serializer {
	private chunks: Buffer[] = [];
	private currentSize = 0;

	serialize(lines: StyledChar[][]): Buffer {
		this.reset();
		this.writeUInt32(lines.length);
		for (const line of lines) {
			this.writeLine(line);
		}

		return Buffer.concat(this.chunks, this.currentSize);
	}

	private reset() {
		this.chunks = [];
		this.currentSize = 0;
	}

	private writeLine(line: StyledChar[]) {
		this.writeUInt32(line.length);
		for (const char of line) {
			this.writeStyledChar(char);
		}
	}

	private writeStyledChar(char: StyledChar) {
		let flags = 0;
		if (char.fullWidth) flags |= FULL_WIDTH_MASK;
		if (char.styles.length > 0) flags |= HAS_STYLES_MASK;

		this.writeUInt8(flags);
		this.writeString(char.value);

		if (flags & HAS_STYLES_MASK) {
			this.writeUInt8(char.styles.length);
			for (const style of char.styles) {
				this.writeAnsiCode(style);
			}
		}
	}

	private writeAnsiCode(code: AnsiCode) {
		this.writeString(code.code);
		this.writeString(code.endCode);
	}

	private writeString(str: string) {
		const len = Buffer.byteLength(str);
		this.writeUInt16(len);
		const buf = Buffer.allocUnsafe(len);
		buf.write(str);
		this.append(buf);
	}

	private writeUInt32(value: number) {
		const buf = Buffer.allocUnsafe(4);
		buf.writeUInt32LE(value);
		this.append(buf);
	}

	private writeUInt16(value: number) {
		const buf = Buffer.allocUnsafe(2);
		buf.writeUInt16LE(value);
		this.append(buf);
	}

	private writeUInt8(value: number) {
		const buf = Buffer.allocUnsafe(1);
		buf.writeUInt8(value);
		this.append(buf);
	}

	private append(buf: Buffer) {
		this.chunks.push(buf);
		this.currentSize += buf.length;
	}
}

export class Deserializer {
	private buffer: Buffer;
	private offset = 0;

	constructor(buffer: Buffer) {
		this.buffer = buffer;
	}

	deserialize(): StyledChar[][] {
		const lineCount = this.readUInt32();
		const lines: StyledChar[][] = new Array(lineCount);

		for (let i = 0; i < lineCount; i++) {
			lines[i] = this.readLine();
		}

		return lines;
	}

	private readLine(): StyledChar[] {
		const charCount = this.readUInt32();
		const line: StyledChar[] = new Array(charCount);

		for (let i = 0; i < charCount; i++) {
			line[i] = this.readStyledChar();
		}

		return line;
	}

	private readStyledChar(): StyledChar {
		const flags = this.readUInt8();
		const fullWidth = (flags & FULL_WIDTH_MASK) !== 0;
		const hasStyles = (flags & HAS_STYLES_MASK) !== 0;

		const value = this.readString();
		const styles: AnsiCode[] = [];

		if (hasStyles) {
			const styleCount = this.readUInt8();
			for (let i = 0; i < styleCount; i++) {
				styles.push(this.readAnsiCode());
			}
		}

		return {
			type: 'char',
			value,
			fullWidth,
			styles,
		};
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
		const len = this.readUInt16();
		const str = this.buffer.toString('utf8', this.offset, this.offset + len);
		this.offset += len;
		return str;
	}

	private readUInt32(): number {
		const value = this.buffer.readUInt32LE(this.offset);
		this.offset += 4;
		return value;
	}

	private readUInt16(): number {
		const value = this.buffer.readUInt16LE(this.offset);
		this.offset += 2;
		return value;
	}

	private readUInt8(): number {
		const value = this.buffer.readUInt8(this.offset);
		this.offset += 1;
		return value;
	}
}
