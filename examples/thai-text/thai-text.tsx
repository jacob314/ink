import React from 'react';
import {render, Box, Text} from '../../src/index.js';

function ThaiText() {
return (
<Box flexDirection="column" padding={1}>
<Text>English: Hello World</Text>
<Text>Thai: สวัสดีครับ</Text>
<Text>Thai: ภาษาไทย</Text>
<Text>Thai with vowels: เด็ก</Text>
<Text>Thai with tone marks: ก่า ก้า ก๊า ก๋า</Text>
<Box borderStyle="round" width={20}>
<Text>Thai: สวัสดีครับ</Text>
</Box>
<Box borderStyle="round" width={15}>
<Text>Thai: ภาษาไทย</Text>
</Box>
</Box>
);
}

render(<ThaiText />);
