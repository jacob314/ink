
import React from 'react';
import {render, Text, Box} from '../../src/index.js';

const Emojis = () => (
	<Box borderStyle="round" padding={2} flexDirection="column">
		<Text>ℹ</Text>
		<Text>😋</Text>
		<Text>✔️</Text>
		<Text>✅</Text>
		<Text>🦄</Text>
		<Text>🌈</Text>
		<Text>🌮</Text>
		<Text>🌯</Text>
		<Text>🚀</Text>
		<Text>🌌</Text>
		<Text>🐈</Text>
		<Text>🐕</Text>
		<Text>✨</Text>
		<Text>💖</Text>
		<Text>💕</Text>
		<Text>😂</Text>
		<Text>🎉</Text>
		<Text>🎊</Text>
		<Text>👩‍❤️‍💋‍👩</Text>
		<Text>👨‍❤️‍💋‍👨</Text>
		<Text>👩‍❤️‍💋‍👨</Text>
		<Text>👨‍❤️‍👨</Text>
		<Text>👩‍❤️‍👨</Text>
		<Text>🏳️‍🌈</Text>
	</Box>
);

render(<Emojis />);
