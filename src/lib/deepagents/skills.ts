import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BackendProtocol } from './backends';

/**
 * Skills, the official way (Agent Skills standard): a skill is a DIRECTORY on
 * the backend — `/skills/<name>/SKILL.md` plus optional `scripts/`,
 * `references/` and `assets/`. There is no load_skill tool. Disclosure is
 * progressive across three levels:
 *   1. catalog  — only frontmatter {name, description} ships in the system prompt
 *   2. manual   — the agent read_file()s SKILL.md when the task matches
 *   3. resources — scripts/references/assets, fetched on demand as the manual directs
 */

export interface SkillCatalogEntry {
	/** Frontmatter name — must match the directory name. */
	name: string;
	description: string;
	/** Directory of the skill, e.g. /skills/refund-policy/ */
	dir: string;
	/** Path of the SKILL.md to read for level 2. */
	file: string;
	/** Body length in characters (for meters; body itself stays on disk). */
	bodyChars: number;
}

/** Parse SKILL.md YAML-ish frontmatter (single-line `name:` / `description:`). */
export function parseSkillFrontmatter(
	content: string
): { name: string; description: string; body: string } | null {
	const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return null;
	const head = m[1];
	const body = m[2] ?? '';
	const name = head.match(/^name:\s*(.+)\s*$/m)?.[1]?.trim();
	const description = head.match(/^description:\s*(.+)\s*$/m)?.[1]?.trim();
	if (!name || !description) return null;
	return { name, description, body };
}

/**
 * Level 1: scan the configured skill source paths for `<dir>/SKILL.md` files
 * and build the catalog. Official rules honored here:
 *  - frontmatter `name` must match the directory name, or the skill is skipped
 *  - when two sources ship the same name, the LAST source wins
 */
export async function scanSkillCatalog(
	backend: BackendProtocol,
	paths: string[]
): Promise<SkillCatalogEntry[]> {
	const files = await backend.list();
	const byName = new Map<string, SkillCatalogEntry>();
	for (const source of paths) {
		const prefix = source.endsWith('/') ? source : source + '/';
		for (const f of files) {
			if (!f.path.startsWith(prefix) || !f.path.endsWith('/SKILL.md')) continue;
			const rel = f.path.slice(prefix.length); // e.g. refund-policy/SKILL.md
			const parts = rel.split('/');
			if (parts.length !== 2) continue; // skills live exactly one dir deep
			const dirName = parts[0];
			const parsed = parseSkillFrontmatter(f.content);
			if (!parsed || parsed.name !== dirName) continue; // name must match dir
			byName.set(parsed.name, {
				name: parsed.name,
				description: parsed.description,
				dir: prefix + dirName + '/',
				file: f.path,
				bodyChars: parsed.body.length
			});
		}
	}
	return [...byName.values()];
}

export interface RunScriptHooks {
	backend: BackendProtocol;
	onRun?(path: string, ok: boolean): void;
}

/**
 * Browser stand-in for script execution. Officially, skill scripts run in a
 * sandbox backend (or QuickJS interpreter middleware); here a script is a JS
 * file on the backend that defines `function main(input) { ... }`, executed in
 * a Function scope with browser globals shadowed. Deterministic logic belongs
 * in scripts precisely because the model should not improvise it.
 */
export function createRunScriptTool(hooks: RunScriptHooks) {
	return tool(
		async ({ path, input }) => {
			const code = await hooks.backend.read(path);
			if (code === null) {
				hooks.onRun?.(path, false);
				return `No script at ${path}. Check the skill's SKILL.md for the exact scripts/ path.`;
			}
			try {
				const parsedInput = input ? JSON.parse(input) : {};
				// Shadow the obvious escape hatches; scripts get input and nothing else.
				const fn = new Function(
					'input',
					'window',
					'document',
					'globalThis',
					'fetch',
					'localStorage',
					`"use strict";\n${code}\nreturn main(input);`
				);
				const result = fn(parsedInput, undefined, undefined, undefined, undefined, undefined);
				hooks.onRun?.(path, true);
				return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
			} catch (e) {
				hooks.onRun?.(path, false);
				return `Script ${path} failed: ${e instanceof Error ? e.message : String(e)}`;
			}
		},
		{
			name: 'run_script',
			description:
				'Execute a JavaScript helper script that ships on the filesystem (typically a ' +
				"skill's scripts/ directory). The script defines main(input); pass `input` as a " +
				'JSON string. Use scripts for math, dates, and formats — never compute those by hand.',
			schema: z.object({
				path: z.string().describe('Filesystem path of the script, e.g. /skills/x/scripts/y.js'),
				input: z
					.string()
					.optional()
					.describe('JSON string passed to main() as its input argument.')
			})
		}
	);
}

export type RunScriptTool = ReturnType<typeof createRunScriptTool>;
