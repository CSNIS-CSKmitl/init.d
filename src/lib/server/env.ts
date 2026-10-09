import { env } from '$env/dynamic/private';

// Validate at request time so CI can check/build without production credentials.
export function requiredEnv(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Missing required server environment variable: ${name}`);
	return value;
}
