import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

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
		plugins: [tailwindcss(), sveltekit()],
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