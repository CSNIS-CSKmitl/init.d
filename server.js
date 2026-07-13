import { handler } from './build/handler.js';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Client as SshClient } from 'ssh2';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
	if (request.url && request.url.startsWith('/ssh-ws')) {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request);
		});
	} else {
		// Let other upgrades (if any) or standard HTTP pass through to handler
	}
});

wss.on('connection', (ws) => {
	let sshClient = null;
	let sshStream = null;

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message.toString());

			if (data.type === 'init') {
				const { host, port, username, password, privateKey, cols, rows } = data;

				if (!host || !username) {
					ws.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
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
