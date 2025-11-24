import {Buffer} from 'node:buffer';
import type {StyledChar, AnsiCode} from '@alcalzone/ansi-tokenize';

// Constants for binary format
const hasStylesMask = 0b0000_0010;
const fullWidthMask = 0b0000_0001;

export class Serializer {
	private chunks: Uint8Array[] = [];
	private currentSize = 0;

	serialize(lines: StyledChar[][]): Uint8Array {
		this.reset();
		this.writeUint32(lines.length);
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
		this.writeUint32(line.length);
		for (const char of line) {
			this.writeStyledChar(char);
		}
	}

	private writeStyledChar(char: StyledChar) {
		let flags = 0;
		if (char?.fullWidth) {
			// eslint-disable-next-line no-bitwise
			flags |= fullWidthMask;
		}

		if (char?.styles?.length > 0) {
			// eslint-disable-next-line no-bitwise
			flags |= hasStylesMask;
		}

		this.writeUint8(flags);
		this.writeString(char?.value || '');

		// eslint-disable-next-line no-bitwise
		if (flags & hasStylesMask) {
			this.writeUint8(char.styles.length);
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
		this.writeUint16(len);
		const buf = Buffer.allocUnsafe(len);
		buf.write(str);
		this.append(buf);
	}

	private writeUint32(value: number) {
		const buf = Buffer.allocUnsafe(4);
		buf.writeUint32LE(value);
		this.append(buf);
	}

	private writeUint16(value: number) {
		const buf = Buffer.allocUnsafe(2);
		buf.writeUint16LE(value);
		this.append(buf);
	}

	private writeUint8(value: number) {
		const buf = Buffer.allocUnsafe(1);
		buf.writeUint8(value);
		this.append(buf);
	}

	private append(buf: Uint8Array) {
		this.chunks.push(buf);
		this.currentSize += buf.length;
	}
}

export class Deserializer {
	private offset = 0;

	constructor(private readonly buffer: Uint8Array) {}

	deserialize(): StyledChar[][] {
		const lineCount = this.readUint32();
		const lines: StyledChar[][] = [];

		for (let i = 0; i < lineCount; i++) {
			lines.push(this.readLine());
		}

		return lines;
	}

	private readLine(): StyledChar[] {
		const charCount = this.readUint32();
		const line: StyledChar[] = [];

		for (let i = 0; i < charCount; i++) {
			line.push(this.readStyledChar());
		}

		return line;
	}

	private readStyledChar(): StyledChar {
		const flags = this.readUint8();
		// eslint-disable-next-line no-bitwise
		const fullWidth = (flags & fullWidthMask) !== 0;
		// eslint-disable-next-line no-bitwise
		const hasStyles = (flags & hasStylesMask) !== 0;

		const value = this.readString();
		const styles: AnsiCode[] = [];

		if (hasStyles) {
			const styleCount = this.readUint8();
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
		const len = this.readUint16();
		const str = Buffer.from(this.buffer).toString(
			'utf8',
			this.offset,
			this.offset + len,
		);
		this.offset += len;
		return str;
	}

	private readUint32(): number {
		const value = Buffer.from(this.buffer).readUint32LE(this.offset);
		this.offset += 4;
		return value;
	}

	private readUint16(): number {
		const value = Buffer.from(this.buffer).readUint16LE(this.offset);
		this.offset += 2;
		return value;
	}

	private readUint8(): number {
		const value = Buffer.from(this.buffer).readUint8(this.offset);
		this.offset += 1;
		return value;
	}
}
