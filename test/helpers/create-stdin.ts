import EventEmitter from 'node:events';

export default function createStdin(): NodeJS.ReadStream {
	const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
	stdin.setRawMode = () => stdin;
	stdin.setEncoding = () => stdin;
	stdin.resume = () => stdin;
	stdin.pause = () => stdin;
	stdin.isTTY = true;
	(stdin as any).isRaw = false;
	stdin.read = () => null;
	(stdin as any).unref = () => {};
	(stdin as any).ref = () => {};
	return stdin;
}
