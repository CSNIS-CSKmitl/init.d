import 'dotenv/config';
import { handler } from './build/handler.js';
import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Client as SshClient } from 'ssh2';
import PocketBase from 'pocketbase';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const proxmoxWss = new WebSocketServer({ noServer: true });

const proxmoxHost = process.env.PROXMOX_HOST || 'localhost';
const proxmoxPort = process.env.PROXMOX_PORT || '8006';
const proxmoxUser = process.env.PROXMOX_USER || '';
const proxmoxToken = process.env.PROXMOX_TOKEN || '';
const proxmoxSecret = process.env.PROXMOX_TOKEN_SECRET || '';
const proxmoxAuthHeader = `PVEAPIToken=${proxmoxUser}!${proxmoxToken}=${proxmoxSecret}`;

function parseAuthCookie(cookieHeader) {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(/pb_auth=([^;]+)/);
	if (!match) return null;
	try {
		const decoded = decodeURIComponent(match[1]);
		const data = JSON.parse(decoded);
		if (data && data.token && data.record) {
			return {
				token: data.token,
				userId: data.record.id
			};
		}
	} catch (e) {
		console.error('[SSH-WS Auth Production] Cookie parsing failed:', e);
	}
	return null;
}

server.on('upgrade', (request, socket, head) => {
	const url = request.url || '';
	console.log(`[Production Server Upgrade] Incoming upgrade request: ${url}`);
	if (url.startsWith('/ssh-ws')) {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request);
		});
	} else if (url.startsWith('/proxmox-ws')) {
		proxmoxWss.handleUpgrade(request, socket, head, (ws) => {
			proxmoxWss.emit('connection', ws, request);
		});
	} else {
		console.log(`[Production Server Upgrade] Unhandled upgrade request path: ${url}`);
	}
});

// Proxmox WebSocket Proxy Handler for production
proxmoxWss.on('connection', (clientWs, request) => {
	const reqUrl = request.url || '';
	console.log(`[Proxmox-WS Prod Proxy] Connection opened for request: ${reqUrl}`);

	let targetPath = reqUrl;
	let pveAuthCookie = null;

	const cookieMatch = reqUrl.match(/^\/proxmox-ws\/cookie\/([^/]+)\/(.*)/);
	const urlMatch = reqUrl.match(/[?&]pveauthcookie=([^&]+)/);

	if (cookieMatch) {
		pveAuthCookie = decodeURIComponent(cookieMatch[1]);
		targetPath = '/' + cookieMatch[2];
	} else if (urlMatch) {
		pveAuthCookie = decodeURIComponent(urlMatch[1]);
		targetPath = reqUrl
			.replace(/^\/proxmox-ws/, '')
			.replace(/([?&])pveauthcookie=[^&]+(&|$)/, (_, g1, g2) => (g1 === '?' && g2 === '&' ? '?' : ''))
			.replace(/[?&]$/, '');
	} else {
		targetPath = reqUrl.replace(/^\/proxmox-ws/, '');
	}

	if (!targetPath.startsWith('/')) {
		targetPath = '/' + targetPath;
	}

	const targetHeaders = {
		Host: `${proxmoxHost}:${proxmoxPort}`
	};

	if (pveAuthCookie) {
		targetHeaders['Cookie'] = `PVEAuthCookie=${pveAuthCookie}`;
		console.log('[Proxmox-WS Prod Proxy] Authenticated using dynamic PVEAuthCookie.');
	} else {
		targetHeaders['Authorization'] = proxmoxAuthHeader;
		console.log('[Proxmox-WS Prod Proxy] Authenticated using static PVEAPIToken.');
	}

	const targetUrl = `wss://${proxmoxHost}:${proxmoxPort}${targetPath}`;
	console.log(`[Proxmox-WS Prod Proxy] Proxying WebSocket to ${targetUrl}`);

	const targetWs = new WebSocket(targetUrl, {
		headers: targetHeaders,
		rejectUnauthorized: false
	});

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
		} else {
			messageQueue.push({ data, isBinary });
		}
	});

	targetWs.on('message', (data, isBinary) => {
		if (clientWs.readyState === WebSocket.OPEN) {
			clientWs.send(data, { binary: isBinary });
		}
	});

	clientWs.on('close', (code, reason) => {
		if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
			targetWs.close(code, reason);
		}
	});

	targetWs.on('close', (code, reason) => {
		if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
			clientWs.close(code, reason);
		}
	});

	clientWs.on('error', (err) => {
		console.error('[Proxmox-WS Prod Client Error]:', err.message);
		if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
			targetWs.close();
		}
	});

	targetWs.on('error', (err) => {
		console.error('[Proxmox-WS Prod Target Error]:', err.message);
		if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
			clientWs.close();
		}
	});
});

wss.on('connection', (ws, request) => {
	let sshClient = null;
	let sshStream = null;

	ws.on('message', async (message) => {
		try {
			const data = JSON.parse(message.toString());

			if (data.type === 'init') {
				const { host, port, username, password, privateKey, cols, rows } = data;

				if (!host || !username) {
					ws.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
					ws.close();
					return;
				}

				// Verify authentication via cookie
				const auth = parseAuthCookie(request?.headers?.cookie || '');
				if (!auth) {
					ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized. Please log in.' }));
					ws.close();
					return;
				}

				// Validate token with PocketBase and check instance ownership
				const pb = new PocketBase(process.env.POCKETBASE_URL);
				pb.authStore.save(auth.token, null);
				
				try {
					// 1. Validate token is active
					await pb.collection('users').authRefresh();
					
					// 2. Query to verify if the user has access to this instance by its IP, hostname or dns_name
					const cleanHost = host.replace(/"/g, '\\"');
					const filter = `IP = "${cleanHost}" || hostname = "${cleanHost}" || dns_name = "${cleanHost}"`;
					const instance = await pb.collection('instances').getFirstListItem(filter);
					
					console.log(`[SSH-WS Production Auth] Success. User ${auth.userId} authorized for instance ${instance.hostname} (${instance.IP})`);
				} catch (err) {
					console.error(`[SSH-WS Production Auth] Access denied for host ${host}:`, err.message);
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
						port: Number(port) || 22,
						username,
						password: password || undefined,
						privateKey: privateKey || undefined,
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
});
