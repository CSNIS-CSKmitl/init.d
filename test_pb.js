import net from 'net';

async function main() {
    const ip = "192.168.15.182";
    console.log(`Testing TCP connection to ${ip}:22...`);
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    socket.on('connect', () => {
        console.log(`TCP connection to ${ip}:22 succeeded!`);
        socket.destroy();
    }).on('error', (err) => {
        console.error(`TCP connection to ${ip}:22 failed:`, err.message);
        socket.destroy();
    }).on('timeout', () => {
        console.error(`TCP connection to ${ip}:22 timed out!`);
        socket.destroy();
    }).connect(22, ip);
}

main();
