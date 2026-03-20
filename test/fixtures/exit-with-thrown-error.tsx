import React from 'react';
import {render} from '../../src/index.js';

const Test = () => {
	throw new Error('errored');
};

render(<Test />);
