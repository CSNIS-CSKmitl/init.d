import 'dotenv/config';
import { handler } from './build/handler.js';
import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Client as SshClient } from 'ssh2';
import { isIP } from 'node:net';
import { startNodeSync } from './scripts/sync-instance-nodes.mjs';
import { authenticateSocket, authorizedInstance, authorizeConsoleSocket, isAllowedOrigin } from './src/lib/server/ws-auth.mjs';
import { createHostVerifier } from './src/lib/server/ssh-hostkeys.mjs';

if (!process.env.ORIGIN) throw new Error('ORIGIN must be set to the public URL of this portal.');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
const proxmoxWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

const proxmoxHost = process.env.PROXMOX_HOST || 'localhost';
const proxmoxPort = process.env.PROXMOX_PORT || '8006';
function rejectUpgrade(socket, status, message) {
	if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
}

server.on('upgrade', async (request, socket, head) => {
	try {
		const url = new URL(request.url || '/', 'http://internal');
		const isSsh = url.pathname === '/ssh-ws';
		const isProxmox = url.pathname.startsWith('/proxmox-ws/');
		if (!isSsh && !isProxmox) return rejectUpgrade(socket, 404, 'Not Found');
		if (!isAllowedOrigin(request, process.env.ORIGIN)) return rejectUpgrade(socket, 403, 'Forbidden');
		const auth = await authenticateSocket(request, process.env.POCKETBASE_URL);
		if (!auth) return rejectUpgrade(socket, 401, 'Unauthorized');
		if (isProxmox) {
			const target = await authorizeConsoleSocket(request, auth, process.env.CONSOLE_GRANT_SECRET || process.env.PROXMOX_TOKEN_SECRET);
			if (!target) return rejectUpgrade(socket, 403, 'Forbidden');
			request.proxmoxTargetPath = target.targetPath;
			request.pveAuthCookie = target.pveAuthCookie;
			proxmoxWss.handleUpgrade(request, socket, head, (ws) => proxmoxWss.emit('connection', ws, request));
		} else {
			wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request, auth));
		}
	} catch (error) {
		console.error('[WebSocket upgrade]', error);
		rejectUpgrade(socket, 500, 'Internal Server Error');
	}
});

// Proxmox WebSocket Proxy Handler for production
proxmoxWss.on('connection', (clientWs, request) => {
	const reqUrl = request.url || '';
	console.log(`[Proxmox-WS Prod Proxy] Connection opened for request: ${reqUrl.split('?')[0]}`);

	const targetPath = request.proxmoxTargetPath;
	const pveAuthCookie = request.pveAuthCookie;

	const targetHeaders = {
		Host: `${proxmoxHost}:${proxmoxPort}`
	};

	targetHeaders['Cookie'] = `PVEAuthCookie=${pveAuthCookie}`;

	const targetUrl = `wss://${proxmoxHost}:${proxmoxPort}${targetPath}`;
	console.log(`[Proxmox-WS Prod Proxy] Proxying WebSocket to ${targetUrl.split('?')[0]}`);

	const targetWs = new WebSocket(targetUrl, {
		headers: targetHeaders,
		rejectUnauthorized: process.env.PROXMOX_SKIP_TLS_VERIFY !== 'true'
	});
	const closeWs = (ws) => {
		if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
		else if (ws.readyState === WebSocket.OPEN) ws.close();
	};

	let isTargetOpen = false;
	const messageQueue = [];

	targetWs.on('open', () => {
		isTargetOpen = true;
		console.log('[Proxmox-WS Prod Proxy] Connected to Proxmox target.');
		while (messageQueue.length > 0) {
			const item = messageQueue.shift();
			if (targetWs.readyState === WebSocket.OPEN) {
				targetWs.send(item.data, { binary: item.isBinary });
			}
		}
	});

	clientWs.on('message', (data, isBinary) => {
		if (isTargetOpen && targetWs.readyState === WebSocket.OPEN) {
			targetWs.send(data, { binary: isBinary });
		} else if (targetWs.readyState === WebSocket.CONNECTING && messageQueue.length < 32) {
			messageQueue.push({ data, isBinary });
		} else {
			closeWs(clientWs);
		}
	});

	targetWs.on('message', (data, isBinary) => {
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.send(data, { binary: isBinary });
		}
	});

	clientWs.on('close', () => {
		closeWs(targetWs);
	});

	targetWs.on('close', () => {
		closeWs(clientWs);
	});

	clientWs.on('error', (err) => {
		console.error('[Proxmox-WS Prod Client Error]:', err.message);
		closeWs(targetWs);
	});

	targetWs.on('error', (err) => {
		console.error('[Proxmox-WS Prod Target Error]:', err.message);
		closeWs(clientWs);
	});
});

wss.on('connection', (ws, request, auth) => {
	let sshClient = null;
	let sshStream = null;

	ws.on('message', async (message) => {
		try {
			const data = JSON.parse(message.toString());

			if (data.type === 'init') {
				const { instanceId, port, username, password, privateKey, cols, rows } = data;
				if (sshClient || !instanceId || typeof username !== 'string' || !username || username.length > 64) {
					ws.send(JSON.stringify({ type: 'error', message: 'Invalid SSH request' }));
					ws.close();
					return;
				}
				const instance = await authorizedInstance(auth, instanceId);
				const host = instance?.IP;
				const sshPort = Number(port);
				if (!host || !isIP(host) || !Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
					ws.send(JSON.stringify({ type: 'error', message: 'Forbidden. You do not have access to this instance.' }));
					ws.close();
					return;
				}

				sshClient = new SshClient();
				sshClient
					.on('ready', () => {
						sshClient.shell(
							{ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 },
							(err, stream) => {
								if (err) {
									ws.send(JSON.stringify({ type: 'error', message: err.message }));
									ws.close();
									return;
								}

								sshStream = stream;
								ws.send(JSON.stringify({ type: 'connected' }));

								stream.on('data', (buf) => {
									ws.send(JSON.stringify({ type: 'data', data: buf.toString('utf-8') }));
								});

								stream.on('close', () => {
									ws.close();
								});
							}
						);
					})
					.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
						if (prompts.length > 0 && password) {
							finish(prompts.map(() => password));
						} else {
							finish([]);
						}
					})
					.on('error', (err) => {
						ws.send(JSON.stringify({ type: 'error', message: err.message }));
						ws.close();
					})
					.connect({
						host,
						port: sshPort,
						username,
						password: password || undefined,
						privateKey: privateKey || undefined,
						hostVerifier: createHostVerifier(instanceId),
						tryKeyboard: true,
						readyTimeout: 20000
					});
			} else if (data.type === 'data') {
				if (sshStream) {
					sshStream.write(data.data);
				}
			} else if (data.type === 'resize') {
				if (sshStream) {
					sshStream.setWindow(data.rows, data.cols, 0, 0);
				}
			}
		} catch (e) {
			console.error('[SSH-WS Prod Error]:', e);
			ws.send(JSON.stringify({ type: 'error', message: e.message }));
		}
	});

	ws.on('close', () => {
		if (sshStream) sshStream.end();
		if (sshClient) sshClient.end();
	});
});

// Serve SvelteKit build handler
app.use(handler);

const port = process.env.PORT || 3000;
server.listen(port, () => {
	console.log(`[Production Server] WebTTY & SvelteKit running on port ${port}`);
	if (process.env.NODE_SYNC_ENABLED !== 'false') {
		const stopNodeSync = startNodeSync();
		server.once('close', stopNodeSync);
	}
});
