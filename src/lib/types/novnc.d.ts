declare module '@novnc/novnc' {
	export default class RFB {
		constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string } });
		scaleViewport: boolean;
		clipViewport: boolean;
		disconnect(): void;
		sendCredentials(credentials: { password: string }): void;
		sendCtrlAltDel(): void;
		addEventListener(type: 'connect' | 'credentialsrequired', listener: () => void): void;
		addEventListener(type: 'securityfailure', listener: (event: CustomEvent<{ reason?: string }>) => void): void;
		addEventListener(type: 'disconnect', listener: (event: CustomEvent<{ clean: boolean }>) => void): void;
	}
}
