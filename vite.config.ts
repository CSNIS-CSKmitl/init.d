import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { IncomingMessage } from 'node:http';
import { Client as SshClient } from 'ssh2';
import { isIP } from 'node:net';
import { startNodeSync } from './scripts/sync-instance-nodes.mjs';
import { authenticateSocket, authorizedInstance, authorizeConsoleSocket, isAllowedOrigin } from './src/lib/server/ws-auth.mjs';
import { createHostVerifier } from './src/lib/server/ssh-hostkeys.mjs';

export default defineConfig(({ mode }) => {
	// Load .env for the development WebSocket server.
	const env = loadEnv(mode, process.cwd(), '');
	const proxmoxHost = env.PROXMOX_HOST || 'localhost';
	const proxmoxPort = env.PROXMOX_PORT || '8006';

	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			{
				name: 'instance-node-sync',
				apply: 'serve',
				configureServer(server) {
					if (env.NODE_SYNC_ENABLED === 'false') return;
					const stopNodeSync = startNodeSync({ config: { ...process.env, ...env } });
					server.httpServer?.once('close', stopNodeSync);
				}
			},
			{
				name: 'ssh-ws-dev-server',
				configureServer(server) {
					const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
					server.httpServer?.on('upgrade', async (req, socket, head) => {
						if (req.url !== '/ssh-ws') return;
						if (!isAllowedOrigin(req, `${server.config.server.https ? 'https' : 'http'}://${req.headers.host}`)) {
							socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
							return;
						}
						const auth = await authenticateSocket(req, env.POCKETBASE_URL);
						if (!auth) {
							socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
							return;
						}
						wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, auth));
					});

					wss.on('connection', (ws: WebSocket, _request: IncomingMessage, auth: any) => {
						let sshClient: SshClient | null = null;
						let sshStream: any = null;

						ws.on('message', async (message: string) => {
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
											sshClient!.shell(
												{ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 },
												(err, stream) => {
													if (err) {
														ws.send(JSON.stringify({ type: 'error', message: err.message }));
														ws.close();
														return;
													}

													sshStream = stream;
													ws.send(JSON.stringify({ type: 'connected' }));

													stream.on('data', (buf: Buffer) => {
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
							} catch (e: any) {
								console.error('[SSH-WS Dev Error]:', e);
								ws.send(JSON.stringify({ type: 'error', message: e.message }));
							}
						});

						ws.on('close', () => {
							if (sshStream) sshStream.end();
							if (sshClient) sshClient.end();
						});
					});
				}
			},
			{
				name: 'proxmox-ws-dev-server',
				configureServer(server) {
					const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
					server.httpServer?.on('upgrade', async (req, socket, head) => {
						if (!new URL(req.url || '/', 'http://internal').pathname.startsWith('/proxmox-ws/')) return;
						if (!isAllowedOrigin(req, `${server.config.server.https ? 'https' : 'http'}://${req.headers.host}`)) {
							socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
							return;
						}
						const auth = await authenticateSocket(req, env.POCKETBASE_URL);
						if (!auth) {
							socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
							return;
						}
						const target = await authorizeConsoleSocket(req, auth, env.CONSOLE_GRANT_SECRET || env.PROXMOX_TOKEN_SECRET);
						if (!target) {
							socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
							return;
						}
						wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, target));
					});
					wss.on('connection', (clientWs: WebSocket, _request: IncomingMessage, target: any) => {
						const targetWs = new WebSocket(`wss://${proxmoxHost}:${proxmoxPort}${target.targetPath}`, {
							headers: { Host: `${proxmoxHost}:${proxmoxPort}`, Cookie: `PVEAuthCookie=${target.pveAuthCookie}` },
							rejectUnauthorized: env.PROXMOX_SKIP_TLS_VERIFY !== 'true'
						});
						const pending: { data: Buffer; binary: boolean }[] = [];
						const close = (ws: WebSocket) => {
							if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
							else if (ws.readyState === WebSocket.OPEN) ws.close();
						};
						targetWs.on('open', () => {
							for (const item of pending) targetWs.send(item.data, { binary: item.binary });
							pending.length = 0;
						});
						clientWs.on('message', (data: RawData, binary: boolean) => {
							if (targetWs.readyState === WebSocket.OPEN) targetWs.send(data, { binary });
							else if (targetWs.readyState === WebSocket.CONNECTING && pending.length < 32) pending.push({ data: Buffer.from(data as Buffer), binary });
							else close(clientWs);
						});
						targetWs.on('message', (data, binary) => {
							if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary });
						});
						clientWs.on('close', () => close(targetWs));
						targetWs.on('close', () => close(clientWs));
						clientWs.on('error', () => close(targetWs));
						targetWs.on('error', () => close(clientWs));
					});
				}
			}
		],
		server: {
			fs: {
				allow: ['..', '.svelte-kit', '.svelte-kit/**']
			}
		},
		build: {
			sourcemap: false
		}
	};
});
