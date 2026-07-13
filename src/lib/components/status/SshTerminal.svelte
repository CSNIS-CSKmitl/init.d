<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import {
		RefreshCw,
		Play,
		ShieldAlert,
		KeyRound,
		Terminal,
	} from "lucide-svelte";

	let {
		defaultHost = "",
		defaultIP = "",
		defaultUsername = "root",
	}: {
		defaultHost?: string;
		defaultIP?: string;
		defaultUsername?: string;
	} = $props();

	// Form states
	let host = $state("");
	let IP = $state("");
	let port = $state("22");
	let username = $state("");
	let password = $state("");
	let privateKey = $state("");

	// Connection status
	let status = $state<"disconnected" | "connecting" | "connected" | "error">(
		"disconnected",
	);
	let errorMessage = $state("");

	// UI element binds
	let terminalContainer = $state<HTMLDivElement>();
	let ws: WebSocket | null = null;
	let cleanup: (() => void) | null = null;

	onMount(() => {
		host = defaultHost;
		IP = defaultIP;
		username = defaultUsername;
	});

	async function handleConnect(e: Event) {
		e.preventDefault();
		host = IP;
		if (!host || !username) {
			status = "error";
			errorMessage = "Host and Username are required.";
			return;
		}

		status = "connecting";
		errorMessage = "";

		try {
			const loc = window.location;
			const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
			const wsUrl = `${wsProtocol}//${loc.host}/ssh-ws`;

			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				// Initialize the terminal imports dynamically
				initTerminal();
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data);
					if (msg.type === "connected") {
						status = "connected";
						termInstance?.writeln(
							"\x1b[1;32m// SSH Session Established Successfully.\x1b[0m\r\n",
						);
						setTimeout(() => {
							try {
								fitAddonInstance?.fit();
								if (
									ws?.readyState === WebSocket.OPEN &&
									termInstance
								) {
									ws.send(
										JSON.stringify({
											type: "resize",
											cols: termInstance.cols,
											rows: termInstance.rows,
										}),
									);
								}
							} catch (e) {
								console.error(e);
							}
						}, 50);
					} else if (msg.type === "data") {
						termInstance?.write(msg.data);
					} else if (msg.type === "error") {
						status = "error";
						errorMessage =
							msg.message || "SSH connection error occurred.";
						ws?.close();
					}
				} catch (err: any) {
					console.error("[WebTTY Message Error]:", err);
				}
			};

			ws.onerror = () => {
				status = "error";
				errorMessage = "WebSocket proxy connection failed.";
			};

			ws.onclose = () => {
				if (status === "connected") {
					termInstance?.writeln(
						"\r\n\x1b[1;31m// SSH Connection closed.\x1b[0m",
					);
				}
				if (status !== "error") {
					status = "disconnected";
				}
			};
		} catch (err: any) {
			status = "error";
			errorMessage = err.message || "Failed to initialize connection.";
		}
	}

	let termInstance: any = null;
	let fitAddonInstance: any = null;

	async function initTerminal() {
		const { Terminal: Xterm } = await import("@xterm/xterm");
		const { FitAddon } = await import("@xterm/addon-fit");
		await import("@xterm/xterm/css/xterm.css");

		const term = new Xterm({
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

		termInstance = term;
		const fitAddon = new FitAddon();
		fitAddonInstance = fitAddon;
		term.loadAddon(fitAddon);

		// Short timeout to ensure display reflow is calculated correctly
		setTimeout(() => {
			if (!terminalContainer) return;
			term.open(terminalContainer);

			// Send the SSH initialization details to the proxy server
			ws?.send(
				JSON.stringify({
					type: "init",
					host,
					port: Number(port) || 22,
					username,
					password,
					privateKey,
					cols: term.cols,
					rows: term.rows,
				}),
			);
		}, 100);

		term.onData((data) => {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "data", data }));
			}
		});

		term.onResize((evt) => {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						type: "resize",
						cols: evt.cols,
						rows: evt.rows,
					}),
				);
			}
		});

		const ro = new ResizeObserver(() => {
			try {
				fitAddon.fit();
			} catch {
				/* ignore resize calculations on hidden elements */
			}
		});
		if (terminalContainer) {
			ro.observe(terminalContainer);
		}

		cleanup = () => {
			ro.disconnect();
			term.dispose();
			ws?.close();
		};
	}

	onDestroy(() => {
		cleanup?.();
	});
</script>

<div
	class="flex h-full w-full flex-col bg-zinc-950 font-mono-app text-sm text-app"
>
	{#if status === "disconnected" || status === "error"}
		<div
			class="m-auto w-full max-w-md rounded-xl border border-app bg-surface p-6 shadow-2xl transition-all duration-300"
		>
			<div class="mb-5 flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"
				>
					<KeyRound class="h-5 w-5" />
				</div>
				<div>
					<h4 class="font-bold tracking-tight text-app">
						Connect via Web SSH
					</h4>
					<p
						class="text-[11px] uppercase tracking-wider text-muted-app"
					>
						// Enter credentials below
					</p>
				</div>
			</div>

			{#if status === "error"}
				<div
					class="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3.5 text-xs text-red-400"
				>
					<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
					<div class="min-w-0 flex-1 leading-relaxed">
						<span class="font-bold">Connection Failed:</span>
						{errorMessage}
					</div>
				</div>
			{/if}

			<form onsubmit={handleConnect} class="space-y-4">
				<div class="grid grid-cols-4 gap-3">
					<div class="col-span-3">
						<label
							for="host"
							class="block text-[10px] font-bold uppercase tracking-wider text-muted-app"
							>Host / IP</label
						>
						<input
							type="text"
							id="host"
							bind:value={IP}
							placeholder="192.168.1.100"
							required
							class="mt-1 w-full rounded border border-app bg-elevated px-3 py-2 text-sm text-app transition-colors hover:border-strong-app focus:border-accent focus:outline-none"
						/>
					</div>
					<div class="col-span-1">
						<label
							for="port"
							class="block text-[10px] font-bold uppercase tracking-wider text-muted-app"
							>Port</label
						>
						<input
							type="text"
							id="port"
							bind:value={port}
							placeholder="22"
							required
							class="mt-1 w-full rounded border border-app bg-elevated px-3 py-2 text-sm text-app text-center transition-colors hover:border-strong-app focus:border-accent focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label
						for="username"
						class="block text-[10px] font-bold uppercase tracking-wider text-muted-app"
						>Username</label
					>
					<input
						type="text"
						id="username"
						bind:value={username}
						placeholder="root"
						required
						class="mt-1 w-full rounded border border-app bg-elevated px-3 py-2 text-sm text-app transition-colors hover:border-strong-app focus:border-accent focus:outline-none"
					/>
				</div>

				<div>
					<label
						for="password"
						class="block text-[10px] font-bold uppercase tracking-wider text-muted-app"
						>Password</label
					>
					<input
						type="password"
						id="password"
						bind:value={password}
						placeholder="••••••••"
						class="mt-1 w-full rounded border border-app bg-elevated px-3 py-2 text-sm text-app transition-colors hover:border-strong-app focus:border-accent focus:outline-none"
					/>
				</div>

				<div>
					<label
						for="privateKey"
						class="block text-[10px] font-bold uppercase tracking-wider text-muted-app"
						>Private Key (Optional)</label
					>
					<textarea
						id="privateKey"
						bind:value={privateKey}
						placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
						rows="3"
						class="mt-1 w-full rounded border border-app bg-elevated px-3 py-2 text-xs font-mono text-app transition-colors hover:border-strong-app focus:border-accent focus:outline-none resize-none"
					></textarea>
				</div>

				<button
					type="submit"
					class="flex w-full items-center justify-center gap-2 rounded bg-accent py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-md transition-all hover:bg-accent/90 active:scale-[0.98] cursor-pointer"
				>
					<Play class="h-3.5 w-3.5 fill-current" />
					Connect Session
				</button>
			</form>
		</div>
	{/if}

	{#if status === "connecting"}
		<div class="m-auto flex flex-col items-center gap-3 text-center p-8">
			<RefreshCw class="h-8 w-8 text-accent animate-spin" />
			<p
				class="font-mono text-xs uppercase tracking-widest text-secondary-app animate-pulse"
			>
				// Connecting to target SSH server...
			</p>
			<p class="text-[10px] text-muted-app max-w-xs truncate">
				{username}@{host}:{port}
			</p>
		</div>
	{/if}

	<div
		bind:this={terminalContainer}
		class="h-full w-full p-1 bg-zinc-950"
		class:hidden={status !== "connected"}
	></div>
</div>
