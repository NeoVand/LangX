export type PermissionMode = 'allow' | 'deny' | 'interrupt';

export interface FilesystemPermission {
	operations: ('read' | 'write')[];
	paths: string[];
	mode: PermissionMode;
}

export interface PermissionResult {
	/** What the first matching rule says — 'allow' when no rule matches. */
	decision: PermissionMode;
	matchedRule: FilesystemPermission | null;
	/** Index of the matched rule (handy for UIs); -1 when no rule matched. */
	ruleIndex: number;
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
 * First-match-wins evaluator — declaration order IS the policy. The first
 * rule whose operation and path glob both match decides: allow, deny, or
 * interrupt (route the operation to a human). If no rule matches, the
 * operation is allowed — supply a final catch-all deny for a closed posture.
 */
export function evaluate(
	rules: FilesystemPermission[],
	op: 'read' | 'write',
	path: string
): PermissionResult {
	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i];
		if (!rule.operations.includes(op)) continue;
		if (rule.paths.some((p) => matchPath(p, path))) {
			return {
				decision: rule.mode,
				matchedRule: rule,
				ruleIndex: i,
				reason:
					rule.mode === 'deny'
						? `Denied by rule ${JSON.stringify(rule.paths)} (${op}).`
						: undefined
			};
		}
	}
	return { decision: 'allow', matchedRule: null, ruleIndex: -1 };
}
