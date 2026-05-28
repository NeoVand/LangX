export interface FilesystemPermission {
	operations: ('read' | 'write')[];
	paths: string[];
	mode: 'allow' | 'deny';
}

export interface PermissionResult {
	allowed: boolean;
	matchedRule: FilesystemPermission | null;
	reason?: string;
}

/** Glob-to-regex compiler for the small subset of patterns we need. */
function globToRegex(glob: string): RegExp {
	const re = glob
		.replace(/[.+^$(){}|]/g, '\\$&')
		.replace(/\*\*/g, '__GLOBSTAR__')
		.replace(/\*/g, '[^/]*')
		.replace(/__GLOBSTAR__/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${re}$`);
}

export function matchPath(glob: string, path: string): boolean {
	const normalized = path.startsWith('/') ? path : '/' + path;
	const tries = [normalized, normalized.replace(/^\//, '')];
	const re = globToRegex(glob.replace(/^\//, ''));
	for (const t of tries) {
		const candidate = t.replace(/^\//, '');
		if (re.test(candidate)) return true;
	}
	return false;
}

/**
 * First-match-wins evaluator. The first rule whose operation and path glob
 * match wins; if no rule matches, the action is allowed by default.
 */
export function evaluate(
	rules: FilesystemPermission[],
	op: 'read' | 'write',
	path: string
): PermissionResult {
	for (const rule of rules) {
		if (!rule.operations.includes(op)) continue;
		const matched = rule.paths.some((p) => matchPath(p, path));
		if (matched) {
			return {
				allowed: rule.mode === 'allow',
				matchedRule: rule,
				reason:
					rule.mode === 'deny'
						? `Denied by rule ${JSON.stringify(rule.paths)} (${op}).`
						: undefined
			};
		}
	}
	return { allowed: true, matchedRule: null };
}
