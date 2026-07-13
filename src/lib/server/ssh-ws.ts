import { Client } from 'ssh2';
import type { WebSocket } from 'ws';

export function setupSshWs(wss: any) {
	wss.on('connection', (ws: WebSocket) => {
		let sshClient: Client | null = null;
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

					console.log(`[SSH-WS] Received init: host=${host}, port=${port}, username=${username}, passwordLength=${password ? password.length : 0}, hasPrivateKey=${!!privateKey}`);

					sshClient = new Client();
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
				console.error('[SSH-WS Error]:', e);
				ws.send(JSON.stringify({ type: 'error', message: e.message }));
			}
		});

		ws.on('close', () => {
			if (sshStream) {
				sshStream.end();
			}
			if (sshClient) {
				sshClient.end();
			}
		});
	});
}
