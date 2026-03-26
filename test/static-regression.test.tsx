import React, {act} from 'react';
import test from 'ava';
import {Box, Text, Static} from '../src/index.js';
import {render} from './helpers/render.js';

test('static regression test - first item rendered', async t => {
	function Example() {
		const [tests, setTests] = React.useState<
			Array<{
				id: number;
				title: string;
			}>
		>([]);

		React.useEffect(() => {
			let completedTests = 0;
			let timer: NodeJS.Timeout | undefined;

			const run = () => {
				if (completedTests++ < 10) {
					act(() => {
						setTests(previousTests => [
							...previousTests,
							{
								id: previousTests.length,
								title: `Test #${previousTests.length + 1}`,
							},
						]);
					});

					timer = setTimeout(run, 10);
				}
			};

			run();

			return () => {
				clearTimeout(timer);
			};
		}, []);

		return (
			<>
				<Static items={tests}>
					{test => (
						<Box key={test.id}>
							<Text color="green">✔ {test.title}</Text>
						</Box>
					)}
				</Static>

				<Box marginTop={1}>
					<Text dimColor>Completed tests: {tests.length}</Text>
				</Box>
			</>
		);
	}

	const instance = await render(<Example />, 100, {
		terminalHeight: 20,
	});

	let frame = '';
	for (let i = 0; i < 50; i++) {
		// eslint-disable-next-line no-await-in-loop
		await new Promise<void>(resolve => {
			setTimeout(() => {
				resolve();
			}, 50);
		});
		frame = instance.lastFrame();
		if (frame.includes('Completed tests: 10')) {
			break;
		}
	}

	t.true(frame.includes('✔ Test #1'));
	t.true(frame.includes('✔ Test #10'));
	t.true(frame.includes('Completed tests: 10'));

	await instance.unmount();
});
