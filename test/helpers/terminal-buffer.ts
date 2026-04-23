import type NodeJS from 'node:process';
import instances from '../../src/instances.js';

export function getTerminalBufferContent(stdout: NodeJS.WriteStream): string | undefined {
	const instance = instances.get(stdout);
	const termBuffer = (instance as unknown as {
		terminalBuffer?: {
			workerInstance?: {
				screen: Array<{styledChars: {getText: () => string}}>;
			};
			lines?: Array<{getText: () => string}>;
		};
	})?.terminalBuffer;

	if (termBuffer?.workerInstance) {
		return termBuffer.workerInstance.screen
			.map(l => l.styledChars.getText().trimEnd())
			.join('\n');
	} else if (termBuffer?.lines && termBuffer.lines.length > 0) {
		return termBuffer.lines
			.map(l => l.getText().trimEnd())
			.join('\n');
	}

	return undefined;
}
