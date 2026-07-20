<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import "@xterm/xterm/css/xterm.css";

	let {
		wsUrl,
		ticket,
		user,
	}: { wsUrl: string; ticket: string; user: string } = $props();

	let container: HTMLDivElement;
	let cleanup: (() => void) | null = null;

	onMount(async () => {
		const { Terminal } = await import("@xterm/xterm");
		const { FitAddon } = await import("@xterm/addon-fit");

		const term = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily:
				'"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
			theme: {
				background: "#09090b",
				foreground: "#e4e4e7",
				cursor: "#a1a1aa",
				selectionBackground: "#3f3f46",
				black: "#18181b",
				red: "#f87171",
				green: "#4ade80",
				yellow: "#facc15",
				blue: "#60a5fa",
				magenta: "#c084fc",
				cyan: "#22d3ee",
				white: "#f4f4f5",
				brightBlack: "#3f3f46",
				brightRed: "#fca5a5",
				brightGreen: "#86efac",
				brightYellow: "#fde047",
				brightBlue: "#93c5fd",
				brightMagenta: "#d8b4fe",
				brightCyan: "#67e8f9",
				brightWhite: "#fafafa",
			},
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(container);
		fitAddon.fit();

		term.writeln("\x1b[1;32m// Connecting to Proxmox terminal...\x1b[0m");

		// wsUrl is a relative path (/proxmox-ws/...)
		// Convert it to an absolute URL (ws:// or wss://) so WebSocket client works in browser
		const loc = window.location;
		const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
		const absoluteWsUrl = `${wsProtocol}//${loc.host}${wsUrl}`;

		const ws = new WebSocket(absoluteWsUrl);
		ws.binaryType = "arraybuffer";

		let authenticated = false;

		ws.onopen = () => {
			term.clear();

			// Proxmox termproxy regex fails if the username contains '!'.
			// We strip the token-id part (e.g. init-d@pam!init-d-system -> init-d@pam)
			// to bypass the validation block while keeping the ticket.
			const cleanUser = user.includes("!") ? user.split("!")[0] : user;

			// Send the mandatory authentication credentials: username:ticket\n
			ws.send(`${cleanUser}:${ticket}\n`);

			// Send initial terminal dimension
			ws.send(`1:${term.cols}:${term.rows}:`);
		};

		ws.onmessage = (event) => {
			if (!authenticated) {
				// Parse the first packet to check for Proxmox authentication approval ("OK")
				const rawText =
					typeof event.data === "string"
						? event.data
						: new TextDecoder().decode(event.data);
				if (rawText.trim() === "OK") {
					authenticated = true;
					return;
				}
			}

			// Stream standard PTY/ANSI output to the terminal UI
			if (event.data instanceof ArrayBuffer) {
				term.write(new Uint8Array(event.data));
			} else {
				term.write(String(event.data));
			}
		};

		ws.onerror = (e) => {
			term.writeln(
				`\x1b[1;31m// WebSocket error — see browser console.\x1b[0m`,
			);
		};

		ws.onclose = (e) => {
			term.writeln(
				`\x1b[1;33m// Connection closed (code ${e.code}).\x1b[0m`,
			);
		};

		// Keyboard inputs → formatted as 0:<length>:<data>
		term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(`0:${data.length}:${data}`);
			}
		});

		// Auto-fit and notify Proxmox of resize formatted as 1:<cols>:<rows>:
		term.onResize((evt) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(`1:${evt.cols}:${evt.rows}:`);
			}
		});

		// Auto-fit on window/container resize
		const ro = new ResizeObserver(() => fitAddon.fit());
		ro.observe(container);

		cleanup = () => {
			ro.disconnect();
			ws.close();
			term.dispose();
		};
	});

	onDestroy(() => cleanup?.());
</script>

<div bind:this={container} class="h-full w-full"></div>
