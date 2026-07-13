import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { WebSocketServer } from 'ws';
import { Client as SshClient } from 'ssh2';

export default defineConfig(({ mode }) => {
	// Load .env so we can inject Proxmox credentials into the WS proxy
	const env = loadEnv(mode, process.cwd(), '');
	const proxmoxHost = env.PROXMOX_HOST || 'localhost';
	const proxmoxPort = env.PROXMOX_PORT || '8006';
	const proxmoxUser = env.PROXMOX_USER || '';
	const proxmoxToken = env.PROXMOX_TOKEN || '';
	const proxmoxSecret = env.PROXMOX_TOKEN_SECRET || '';

	// Build the Authorization header value for Proxmox API token auth
	const proxmoxAuthHeader = `PVEAPIToken=${proxmoxUser}!${proxmoxToken}=${proxmoxSecret}`;

	console.log('[Vite Config] Loaded Proxmox Host:', proxmoxHost);
	console.log('[Vite Config] Built Auth Header:', `PVEAPIToken=${proxmoxUser}!${proxmoxToken}=... (len=${proxmoxSecret.length})`);

	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			{
				name: 'ssh-ws-dev-server',
				configureServer(server) {
					const wss = new WebSocketServer({ noServer: true });
					server.httpServer?.on('upgrade', (req, socket, head) => {
						if (req.url?.startsWith('/ssh-ws')) {
							wss.handleUpgrade(req, socket, head, (ws) => {
								wss.emit('connection', ws, req);
							});
						}
					});

					wss.on('connection', (ws) => {
						let sshClient: SshClient | null = null;
						let sshStream: any = null;

						ws.on('message', (message: string) => {
							try {
								const data = JSON.parse(message.toString());

								if (data.type === 'init') {
									const { host, port, username, password, privateKey, cols, rows } = data;

									if (!host || !username) {
										ws.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
										ws.close();
										return;
									}

									console.log(`[SSH-WS Dev] Received init: host=${host}, port=${port}, username=${username}, passwordLength=${password ? password.length : 0}, hasPrivateKey=${!!privateKey}`);

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
			}
		],
		server: {
			fs: {
				allow: ['..', '.svelte-kit', '.svelte-kit/**']
			},
			proxy: {
				'/proxmox-ws': {
					target: `https://${proxmoxHost}:${proxmoxPort}`,
					ws: true,
					changeOrigin: true, // rewrite the Host header to match the Proxmox target host
					secure: false, // bypass self-signed cert
					rewrite: (path) => path.replace(/^\/proxmox-ws\/cookie\/[^\/]+\//, '/').replace(/^\/proxmox-ws/, ''),
					configure: (proxy) => {
						proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
							console.log('[Vite WS Proxy] Upgrading WebSocket connection...');

							const reqUrl = req.url || '';
							const pathMatch = reqUrl.match(/\/cookie\/([^/]+)\//);
							const urlMatch = reqUrl.match(/[?&]pveauthcookie=([^&]+)/);

							if (pathMatch && pathMatch[1]) {
								const pveAuthCookie = decodeURIComponent(pathMatch[1]);
								proxyReq.setHeader('Cookie', `PVEAuthCookie=${pveAuthCookie}`);
								console.log('[Vite WS Proxy] Authenticated using dynamic PVEAuthCookie from path.');
							} else if (urlMatch && urlMatch[1]) {
								const pveAuthCookie = decodeURIComponent(urlMatch[1]);
								proxyReq.setHeader('Cookie', `PVEAuthCookie=${pveAuthCookie}`);
								console.log('[Vite WS Proxy] Authenticated using dynamic PVEAuthCookie from query.');

								// Remove the custom pveauthcookie param from the path forwarded to Proxmox
								const cleanPath = proxyReq.path.replace(/([?&])pveauthcookie=[^&]+(&|$)/, (_, g1, g2) => {
									return g1 === '?' && g2 === '&' ? '?' : '';
								}).replace(/[?&]$/, '');
								proxyReq.path = cleanPath;
							} else {
								// Fallback to static API Token header if no session cookie parameter is present
								proxyReq.setHeader('Authorization', proxmoxAuthHeader);
								console.log('[Vite WS Proxy] Authenticated using static PVEAPIToken.');
							}

							console.log('[Vite WS Proxy] Proxy Request Headers:', proxyReq.getHeaders());
						});
						proxy.on('error', (err) => {
							console.error('[Vite WS Proxy Error]', err.message);
						});
					}
				}
			}
		},
		build: {
			sourcemap: false
		}
	};
});