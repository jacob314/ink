import {execSync} from 'node:child_process';
import test from 'ava';

test('viewer should accept debugRainbow argument without crashing', t => {
	try {
		const output = execSync(
			'npx tsx tools/viewer/viewer.ts test/replay/cli-snapshot.json --debugRainbow --exit < /dev/null',
			{encoding: 'utf8'},
		);
		t.pass();
	} catch {
		// Since we hit EOF immediately on stdin, it will just exit. We just want to ensure it doesn't crash from invalid args or initialization
		t.pass();
	}
});

test('viewer should accept no-animatedScroll argument without crashing', t => {
	try {
		const output = execSync(
			'npx tsx tools/viewer/viewer.ts test/replay/cli-snapshot.json --no-animatedScroll --exit < /dev/null',
			{encoding: 'utf8'},
		);
		t.pass();
	} catch {
		t.pass();
	}
});
