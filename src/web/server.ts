import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import ts from 'typescript';
import {Deserializer} from '../serialization.js';
import {
	deserializeReplayUpdate,
	type ReplayRegionUpdate,
} from '../replay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache latest state to send to new clients
let lastTree: unknown = null;
const regionStates = new Map<string | number, Record<string, unknown>>();

const server = http.createServer(async (req, res) => {
	console.log('SERVER REQ:', req.method, req.url);
		if (req.method === 'POST' && req.url === '/update') {
		let body = '';
		req.on('data', (chunk: string) => {
			body += chunk;
		});
		req.on('end', () => {
			try {
				const data = JSON.parse(body) as {
					tree: unknown;
					updates: ReplayRegionUpdate[];
				};

				lastTree = data.tree;

				// Deserialize updates
				const parsedUpdates = data.updates.map(u => {
					const update = deserializeReplayUpdate(u);
					const dumpUpdate: Record<string, unknown> = {...update};

					// Sync with region state cache
					const cached: Record<string, unknown> = regionStates.get(update.id) ?? {id: update.id};
					const updateEntries = Object.entries(update);
					for (const [key, value] of updateEntries) {
						if (key !== 'lines' && key !== 'id' && key !== 'stickyHeaders') {
							cached[key] = value;
						}
					}

					if (update.lines) {
						const {totalLength} = update.lines;
						const lines = (cached['fullLines'] as unknown[]) ?? [];
						if (lines.length !== totalLength) {
							lines.length = totalLength;
						}

						dumpUpdate['lines'] = {
							totalLength,
							updates: update.lines.updates.map((chunk: any) => {
								const deserializer = new Deserializer(chunk.data as Uint8Array);
								const chunkLines = deserializer.deserialize();

								for (const [i, chunkLine] of chunkLines.entries()) {
									lines[chunk.start + i] = chunkLine;
								}

								return {
									start: chunk.start,
									end: chunk.end,
									lines: chunkLines,
								};
							}),
						};
						cached['fullLines'] = lines;
						cached['lines'] = {
							totalLength,
							updates: [{start: 0, end: totalLength, lines}],
						};
					}

					if (update.stickyHeaders) {
						const headers = update.stickyHeaders.map((h: any) => ({
							...h,
							node: undefined,
							anchor: undefined,
						}));
						dumpUpdate['stickyHeaders'] = headers;
						cached['stickyHeaders'] = headers;
					}

					regionStates.set(update.id, cached);
					return dumpUpdate;
				});

				const broadcastData = JSON.stringify({
					tree: data.tree,
					updates: parsedUpdates,
				});
				for (const client of wss.clients) {
					if (client.readyState === 1 /* OPEN */) {
						client.send(broadcastData);
					}
				}

				res.writeHead(200);
				res.end('OK');
			} catch (error) {
				console.error('Error processing update:', error);
				res.writeHead(400);
				res.end('Bad Request');
			}
		});
		return;
	}

	if (req.method === 'GET' && req.url === '/dump') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ tree: lastTree, updates: [...regionStates.values()] }));
		return;
	}

	// Serve static files
	const filePath = req.url === '/' ? '/index.html' : req.url!;

	try {
		let fullPath = path.join(__dirname, filePath);

		if (fullPath.endsWith('.js')) {
			const tsPath = fullPath.replace(/\.js$/, '.ts');
			try {
				await fs.access(tsPath);
				const tsSource = await fs.readFile(tsPath, 'utf8');
				const result = ts.transpileModule(tsSource, {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ESNext,
					},
				});
				res.writeHead(200, {'Content-Type': 'application/javascript'});
				res.end(result.outputText);
				return;
			} catch {}
		}

		try {
			await fs.access(fullPath);
		} catch {
			if (fullPath.includes('/src/web/')) {
				const buildPath = fullPath.replace('/src/web/', '/build/web/');
				try {
					await fs.access(buildPath);
					fullPath = buildPath;
				} catch {}
			} else if (fullPath.includes('/build/web/')) {
				const srcPath = fullPath.replace('/build/web/', '/src/web/');
				try {
					await fs.access(srcPath);
					fullPath = srcPath;
				} catch {}
			}
		}

		const ext = path.extname(fullPath);
		const content = await fs.readFile(fullPath);
		const mimeTypes: Record<string, string> = {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'.html': 'text/html',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'.js': 'application/javascript',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'.css': 'text/css',
		};
		res.writeHead(200, {'Content-Type': mimeTypes[ext] ?? 'text/plain'});
		res.end(content);
	} catch {
		console.error('File not found:', filePath);
		res.writeHead(404);
		res.end('Not Found');
	}
});

const wss = new WebSocketServer({server});

wss.on('connection', ws => {
	console.log('Client connected to Web Renderer');
	if (lastTree) {
		ws.send(
			JSON.stringify({
				tree: lastTree,
				updates: [...regionStates.values()],
			}),
		);
	}
});

const port = process.env['PORT'] ?? 3000;
server.listen(port, () => {
	const address = server.address();
	const actualPort = typeof address === 'string' ? port : address?.port ?? port;
	console.log(`Ink Web Renderer server listening on http://localhost:${actualPort}`);
});
