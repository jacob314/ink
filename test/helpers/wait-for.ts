import delay from 'delay';

/* eslint-disable no-await-in-loop */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout = 1000,
) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await condition()) {
			return;
		}

		await delay(10);
	}

	throw new Error('Timed out waiting for condition');
}
/* eslint-enable no-await-in-loop */
