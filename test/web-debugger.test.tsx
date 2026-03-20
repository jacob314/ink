import http from 'node:http';
import process from 'node:process';
import test from 'ava';
import React from 'react';
import {render} from '../src/index.js';
import ScrollableContent from '../examples/sticky/sticky.js';
import {waitFor} from './helpers/wait-for.js';
import {generateSvgForTerminal} from './helpers/svg.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import EventEmitter from 'node:events';
import xtermHeadless from '@xterm/headless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const {Terminal: XtermTerminal} = xtermHeadless;

const createTestEnv = (rows = 24, columns = 100) => {
	const term = new XtermTerminal({ cols: columns, rows, allowProposedApi: true });
	let writeCount = 0;
	const stdout = {
		columns,
		rows,
		write(chunk: string) { term.write(chunk); writeCount++; return true; },
		on() {},
		off() {},
	};

	const stdin = new EventEmitter() as any;
	stdin.setRawMode = () => stdin;
	stdin.setEncoding = () => stdin;
	stdin.resume = () => stdin;
	stdin.pause = () => stdin;
	stdin.isTTY = true;
	stdin.isRaw = false;

	let buffer: string[] = [];
	stdin.read = () => {
		if (buffer.length > 0) return buffer.shift();
		return null;
	};
	stdin.push = (chunk: string) => {
		buffer.push(chunk);
		stdin.emit('readable');
	};
	stdin.unref = () => {};
	stdin.ref = () => {};

	const instance = render(<ScrollableContent useStatic={false} initialItems={0} />, {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		debug: false,
		terminalBuffer: true,
		renderProcess: false,
	});

	return { term, stdin, instance, getWriteCount: () => writeCount };
};

test.serial('INK_WEB_DEBUGGER integration with sticky scroll example', async t => {
		const { spawn } = await import('node:child_process');
	const serverProcess = spawn('node', [path.join(__dirname, '../build/web/server.js')], {
		env: { ...process.env, PORT: '0' },
		stdio: 'pipe'
	});

	let serverPort = 0;
	await new Promise<void>((resolve, reject) => {
		serverProcess.stdout!.on('data', (d: Buffer) => {
						const match = d.toString().match(/listening on http:\/\/localhost:(\d+)/);
			if (match) {
				serverPort = parseInt(match[1]!, 10);
				resolve();
			}
		});
		serverProcess.on('error', reject);
	});

	
	process.env['INK_WEB_DEBUGGER'] = String(serverPort);

		const {term, stdin, instance, getWriteCount} = createTestEnv();

		await new Promise(resolve => setTimeout(resolve, 500));

	// Add blocks by pressing space
		stdin.push(' ');
	
		await new Promise(resolve => setTimeout(resolve, 500));

		// Scroll up 10 times by pressing 'w'
	for (let i = 0; i < 10; i++) {
		stdin.push('w'); 
	}
	
	// Wait for scroll render
	await new Promise(resolve => setTimeout(resolve, 1000));

		const finalPayload = await new Promise<Record<string, unknown>>((resolve, reject) => {
		http.get(`http://localhost:${serverPort}/dump`, (res) => {
			let data = '';
			res.on('data', c => data += c);
			res.on('end', () => resolve(JSON.parse(data) as Record<string, unknown>));
		}).on('error', reject);
	});

	t.truthy(finalPayload?.['tree'], 'Received data should have a tree');
	t.truthy(finalPayload?.['updates'], 'Received data should have updates');

	if (!fs.existsSync(path.join(__dirname, 'snapshots'))) {
		fs.mkdirSync(path.join(__dirname, 'snapshots'));
	}
	
	const snapshotPath = path.join(__dirname, 'snapshots', 'web-debugger-payload.json');
	fs.writeFileSync(snapshotPath, JSON.stringify(finalPayload, null, 2));

	const svg = generateSvgForTerminal(term);
	const svgPath = path.join(__dirname, 'snapshots', 'web-debugger-terminal.svg');
	fs.writeFileSync(svgPath, svg);

		const puppeteer = (await import('puppeteer')).default;
	const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
	const page = await browser.newPage();
	// Set viewport slightly larger than typical 100x24 terminal
	await page.setViewport({ width: 850, height: 600 });
	
		await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {});
		await page.waitForSelector('.region', { timeout: 5000 }).catch(() => {});
	// wait for final socket data
	await new Promise(r => setTimeout(r, 1000));
	
		const screenshotPath = path.join(__dirname, 'snapshots', 'web-debugger-browser.png');
	await page.screenshot({ path: screenshotPath, fullPage: true });
	
		await browser.close();

	delete process.env['INK_WEB_DEBUGGER'];
		instance.unmount();
		serverProcess.kill('SIGKILL');
	serverProcess.unref();
	});
