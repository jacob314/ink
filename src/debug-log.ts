import fs from 'node:fs';
import path from 'node:path';

const debugLogEnabled = true;
let isFirstRun = true;
const logFilePath = path.join(process.cwd(), 'debug.log');

export const debugLog = (message: string) => {
	if (!debugLogEnabled) {
		return;
	}

	if (isFirstRun) {
		try {
			fs.writeFileSync(logFilePath, '');
		} catch {}

		isFirstRun = false;
	}

	try {
		fs.appendFileSync(logFilePath, message + '\n');
	} catch {}
};
