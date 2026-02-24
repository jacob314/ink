import EventEmitter from 'node:events';
import {spy} from 'sinon';

// Fake process.stdout
type FakeStdout = {
	get: () => string;
} & NodeJS.WriteStream;

const createStdout = (columns?: number): FakeStdout => {
	const stdout = new EventEmitter() as unknown as FakeStdout;
	stdout.columns = columns ?? 100;

	let output = '';
	const write = spy((data: string) => {
		output += data;
		return true;
	});
	stdout.write = write as unknown as typeof stdout.write;

	stdout.get = () => output;

	return stdout;
};

export default createStdout;
