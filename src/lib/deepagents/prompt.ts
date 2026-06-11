import { SystemMessage } from '@langchain/core/messages';
import type { Todo, VirtualFile } from './state';

/**
 * Mirrors the register of the official deepagents BASE_AGENT_PROMPT ("You are a
 * Deep Agent…", Core Behavior / Doing Tasks), condensed for browser-sized runs.
 * In the official package each middleware injects its own tool guidance; here we
 * fold the essentials into one block the reader can see whole.
 */
export const BASE_AGENT_PROMPT = `You are a Deep Agent, an AI assistant that helps users accomplish tasks using tools.

# Core behavior
- NEVER add unnecessary preamble. Don't say "I'll now do X" — just do it.
- Prioritize accuracy over validating the user's beliefs.

# Doing tasks
- Understand first, act second: read what is there before changing it.
- Plan anything non-trivial with write_todos and keep statuses honest — in_progress while you work, completed when done.
- Prefer files over chat: write drafts, notes and any output longer than a paragraph to the filesystem (ls / read_file / write_file / edit_file / glob / grep).
- Delegate context-heavy work to a subagent with task, so this conversation stays small.
- Verify — check your work against what was asked, not against your own output. Your first attempt is rarely correct: iterate.
- Keep working until the task is fully complete.`;

export interface AssemblePromptOpts {
	user?: string;
	todos?: Todo[];
	files?: VirtualFile[];
	skills?: { name: string; description: string }[];
	memorySummary?: string;
	subagents?: { name: string; description: string }[];
	suffix?: string;
}

export function assembleSystemPrompt(opts: AssemblePromptOpts): string {
	const parts: string[] = [];
	// Official assembly order: USER first, then BASE, then SUFFIX — your
	// instructions outrank the harness's own.
	if (opts.user && opts.user.trim()) parts.push('# USER\n' + opts.user.trim());
	parts.push('# BASE\n' + BASE_AGENT_PROMPT);

	const middle: string[] = [];
	if (opts.subagents?.length) {
		middle.push(
			'## Available subagents\n' +
				opts.subagents
					.map((s) => `- ${s.name}: ${s.description}`)
					.join('\n')
		);
	}
	if (opts.skills?.length) {
		middle.push(
			'## Skill catalog (load on demand)\n' +
				opts.skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
		);
	}
	if (opts.memorySummary && opts.memorySummary.trim()) {
		middle.push('## Persistent memory\n' + opts.memorySummary.trim());
	}
	if (opts.todos && opts.todos.length) {
		const block = opts.todos
			.map((t) => `- [${t.status}] ${t.content}`)
			.join('\n');
		const open = opts.todos.filter((t) => t.status !== 'completed').length;
		middle.push(
			'## Active plan\n' +
				block +
				(open > 0
					? '\n(If any step above is already done, call write_todos NOW with the full updated list before anything else.)'
					: '')
		);
	}
	if (opts.files && opts.files.length) {
		const list = opts.files.map((f) => `- ${f.path}`).join('\n');
		middle.push('## Files in workspace\n' + list);
	}
	if (middle.length) parts.push('# MIDDLEWARE\n' + middle.join('\n\n'));

	if (opts.suffix && opts.suffix.trim()) parts.push('# SUFFIX\n' + opts.suffix.trim());
	return parts.join('\n\n');
}

export function makeSystemMessage(opts: AssemblePromptOpts) {
	return new SystemMessage(assembleSystemPrompt(opts));
}
