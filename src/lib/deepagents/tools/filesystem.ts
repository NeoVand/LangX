import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BackendProtocol } from '../backends';
import type { VirtualFile } from '../state';
import {
	evaluate,
	matchPath,
	type FilesystemPermission
} from '../permissions';

export interface FilesystemToolHooks {
	backend: BackendProtocol;
	permissions: FilesystemPermission[];
	onChange?(files: VirtualFile[]): Promise<void> | void;
	onOp?(op: { tool: string; path?: string; result?: string }): void;
}

function ensureAllowed(
	permissions: FilesystemPermission[],
	op: 'read' | 'write',
	path: string
) {
	const decision = evaluate(permissions, op, path);
	if (!decision.allowed) {
		throw new Error(decision.reason ?? `Permission denied for ${op} on ${path}.`);
	}
}

async function emitChange(hooks: FilesystemToolHooks) {
	const files = await hooks.backend.list();
	await hooks.onChange?.(files);
}

export function buildFilesystemTools(hooks: FilesystemToolHooks) {
	const ls = tool(
		async () => {
			const files = await hooks.backend.list();
			hooks.onOp?.({ tool: 'ls', result: `${files.length} files` });
			if (!files.length) return '(workspace is empty)';
			return files
				.map((f) => `${f.path}\t${f.content.length}b\t${f.backend ?? ''}`)
				.join('\n');
		},
		{
			name: 'ls',
			description: 'List all files currently in the virtual workspace.',
			schema: z.object({})
		}
	);

	const readFile = tool(
		async ({ path, offset = 0, limit = 200 }) => {
			ensureAllowed(hooks.permissions, 'read', path);
			const content = await hooks.backend.read(path);
			hooks.onOp?.({ tool: 'read_file', path });
			if (content == null) return `File not found: ${path}`;
			const lines = content.split(/\r?\n/);
			const slice = lines.slice(offset, offset + limit);
			return slice.join('\n') + (offset + limit < lines.length ? '\n... (truncated)' : '');
		},
		{
			name: 'read_file',
			description:
				'Read a file from the virtual workspace, returning up to {limit} lines starting at {offset}.',
			schema: z.object({
				path: z.string(),
				offset: z.number().int().min(0).optional(),
				limit: z.number().int().min(1).max(2000).optional()
			})
		}
	);

	const writeFile = tool(
		async ({ path, content }) => {
			ensureAllowed(hooks.permissions, 'write', path);
			await hooks.backend.write(path, content);
			hooks.onOp?.({ tool: 'write_file', path });
			await emitChange(hooks);
			return `Wrote ${content.length} bytes to ${path}.`;
		},
		{
			name: 'write_file',
			description: 'Create or overwrite a file in the virtual workspace.',
			schema: z.object({
				path: z.string(),
				content: z.string()
			})
		}
	);

	const editFile = tool(
		async ({ path, oldString, newString, replaceAll = false }) => {
			ensureAllowed(hooks.permissions, 'read', path);
			ensureAllowed(hooks.permissions, 'write', path);
			const content = await hooks.backend.read(path);
			if (content == null) return `File not found: ${path}`;
			let updated: string;
			if (replaceAll) {
				updated = content.split(oldString).join(newString);
			} else {
				const idx = content.indexOf(oldString);
				if (idx < 0) return `oldString not found in ${path}.`;
				const occ = content.split(oldString).length - 1;
				if (occ > 1) return `oldString is not unique in ${path} (${occ} matches). Use replaceAll or pass more context.`;
				updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
			}
			await hooks.backend.write(path, updated);
			hooks.onOp?.({ tool: 'edit_file', path });
			await emitChange(hooks);
			return `Edited ${path}.`;
		},
		{
			name: 'edit_file',
			description:
				'Replace a unique substring in a file with a new one. Use replaceAll=true for many occurrences.',
			schema: z.object({
				path: z.string(),
				oldString: z.string(),
				newString: z.string(),
				replaceAll: z.boolean().optional()
			})
		}
	);

	const glob = tool(
		async ({ pattern }) => {
			const files = await hooks.backend.list();
			const hits = files.filter((f) => matchPath(pattern, f.path));
			hooks.onOp?.({ tool: 'glob', path: pattern, result: `${hits.length} hits` });
			if (!hits.length) return `No matches for ${pattern}.`;
			return hits.map((h) => h.path).join('\n');
		},
		{
			name: 'glob',
			description: 'Find files whose path matches a glob (** matches across directories).',
			schema: z.object({ pattern: z.string() })
		}
	);

	const grep = tool(
		async ({ pattern, ignoreCase = false }) => {
			const re = new RegExp(pattern, ignoreCase ? 'i' : undefined);
			const files = await hooks.backend.list();
			const lines: string[] = [];
			for (const f of files) {
				const ls = f.content.split(/\r?\n/);
				for (let i = 0; i < ls.length; i++) {
					if (re.test(ls[i])) lines.push(`${f.path}:${i + 1}: ${ls[i]}`);
				}
			}
			hooks.onOp?.({ tool: 'grep', path: pattern, result: `${lines.length} hits` });
			if (!lines.length) return `No matches for /${pattern}/.`;
			return lines.slice(0, 100).join('\n');
		},
		{
			name: 'grep',
			description:
				'Search file contents for a regular-expression pattern. Returns up to 100 matching lines as path:line: text.',
			schema: z.object({ pattern: z.string(), ignoreCase: z.boolean().optional() })
		}
	);

	return [ls, readFile, writeFile, editFile, glob, grep];
}
