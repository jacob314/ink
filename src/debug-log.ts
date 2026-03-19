import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const debugLogEnabled = false;
let isFirstRun = true;
const logFilePath = path.join(process.cwd(), 'debug.log');
let logStream: fs.WriteStream | undefined;

export const debugLog = (message: string) => {
	if (!debugLogEnabled) {
		return;
	}

	if (isFirstRun) {
		try {
			logStream = fs.createWriteStream(logFilePath, {flags: 'w'});
		} catch {}

		isFirstRun = false;
	}

	if (logStream) {
		try {
			logStream.write(message + '\n');
		} catch {}
	}
};

export const clearDebugLog = () => {
	if (!debugLogEnabled) {
		return;
	}

	if (logStream) {
		logStream.end();
	}

	try {
		logStream = fs.createWriteStream(logFilePath, {flags: 'w'});
	} catch {}
};
