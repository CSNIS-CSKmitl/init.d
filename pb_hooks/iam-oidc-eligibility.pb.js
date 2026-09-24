// Runs inside PocketBase JSVM, after IAM OAuth2 token exchange and before
// PocketBase creates/links the user or returns an auth token.
// Install in the PocketBase server's pb_hooks directory, not the SvelteKit host.

onRecordAuthWithOAuth2Request((e) => {
	// The shared users collection must not issue a token through an OAuth
	// provider that cannot prove the IAM student role and current major.
	if (e.providerName !== 'oidc') {
		throw e.forbiddenError('Sign in with KMITL IAM is required.', null);
	}
	// PocketBase serializes handlers into isolated JSVM contexts. Keep all
	// helper code inside the handler instead of closing over file variables.
	const IAM_USERINFO_URL = 'https://api.science.kmitl.ac.th/iam/oidc2/userinfo';
	const ALLOWED_NON_STUDENT_ROLES = String($os.getenv('IAM_OIDC_ALLOWED_NON_STUDENT_ROLES') || '')
		.split(',')
		.map((role) => role.trim().toLowerCase())
		.filter(Boolean);
	function currentComputerScienceMajor(profile) {
		if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
		const stack = [profile];
		let inspected = 0;
		while (stack.length && inspected < 64) {
			const value = stack.pop();
			inspected++;
			if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
			if (String(value.major_name_en || '').trim().toLowerCase() === 'computer science' ||
				String(value.major_name || '').trim() === 'วิทยาการคอมพิวเตอร์') return true;
			for (const [key, nested] of Object.entries(value)) {
				if (!/history|past|previous|graduat/i.test(key) && nested && typeof nested === 'object' && !Array.isArray(nested)) {
					stack.push(nested);
				}
			}
		}
		return false;
	}
	if (!e.providerClient || e.providerClient.userInfoURL() !== IAM_USERINFO_URL) {
		throw e.internalServerError('IAM OIDC provider is not configured as expected.', null);
	}
	const identity = e.oAuth2User;
	const info = identity && identity.rawUser;
	if (!identity || !info || typeof info !== 'object' ||
		typeof info.sub !== 'string' || !info.sub || info.sub !== identity.id) {
		throw e.forbiddenError('IAM identity could not be verified.', null);
	}
	const role = String(info.role || '').trim().toLowerCase();
	if (role === 'student') {
		if (!currentComputerScienceMajor(info.profile)) {
			throw e.forbiddenError('Only current Computer Science students may sign in with IAM.', null);
		}
	} else if (!ALLOWED_NON_STUDENT_ROLES.includes(role)) {
		throw e.forbiddenError('This IAM role is not allowed to sign in.', null);
	}
	e.next();
}, 'users');
