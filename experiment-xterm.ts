import xtermHeadless from '@xterm/headless';
const {Terminal} = xtermHeadless;

async function run() {
    try {
        console.log('--- Testing DL in Scroll Region ---');
        const term = new Terminal({cols: 80, rows: 10, allowProposedApi: true});
        
        let data = '';
        for (let i = 0; i < 10; i++) {
            data += `Line ${i}\n`;
        }
        await new Promise(resolve => term.write(data, resolve as any));
        
        // Set scroll region 3-7
        await new Promise(resolve => term.write('\u001b[3;7r', resolve as any));
        
        // Move to row 3 (top of region)
        await new Promise(resolve => term.write('\u001b[3;1H', resolve as any));
        
        // Delete 1 line
        await new Promise(resolve => term.write('\u001b[1M', resolve as any));
        
        console.log('Line 1 (above region):', term.buffer.active.getLine(term.buffer.active.baseY + 1)?.translateToString(true));
        console.log('Line 2 (top of region, was Line 3):', term.buffer.active.getLine(term.buffer.active.baseY + 2)?.translateToString(true));
        console.log('Line 6 (bottom of region):', term.buffer.active.getLine(term.buffer.active.baseY + 6)?.translateToString(true));
        console.log('Line 7 (below region):', term.buffer.active.getLine(term.buffer.active.baseY + 7)?.translateToString(true));

    } catch (e) {
        console.error(e);
    }
}

run();