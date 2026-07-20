import { Client } from 'ssh2';

const conn = new Client();

console.log('Initiating test connection...');

conn.on('ready', () => {
	console.log('READY event fired!');
	conn.shell((err, stream) => {
		if (err) {
			console.error('Shell error:', err);
			return;
		}
		console.log('Shell stream opened successfully!');
		stream.on('close', () => {
			console.log('Stream closed');
			conn.end();
		});
		stream.on('data', (data) => {
			console.log('STDOUT: ' + data);
		});
	});
});

conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
	console.log('KEYBOARD-INTERACTIVE event fired!');
	console.log('Prompts:', prompts);
	if (prompts.length > 0) {
		// Replace with the user's actual password for testing
		const password = 'test'; 
		console.log('Sending password response...');
		finish([password]);
	} else {
		finish([]);
	}
});

conn.on('error', (err) => {
	console.error('ERROR event fired:', err.message);
	console.error(err);
});

conn.on('close', () => {
	console.log('Connection closed');
});

// Configure with the user's target credentials
conn.connect({
	host: '192.168.15.54',
	port: 22,
	username: 'root',
	password: 'YOUR_PASSWORD_HERE', // We'll ask the user to fill this or run it
	tryKeyboard: true,
	readyTimeout: 10000
});
