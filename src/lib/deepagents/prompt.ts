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
	/** Skill catalog entries — level 1 of progressive disclosure. */
	skills?: { name: string; description: string; file?: string }[];
	memorySummary?: string;
	subagents?: { name: string; description: string }[];
	suffix?: string;
}

export interface PromptSection {
	key: 'user' | 'base' | 'subagents' | 'skills' | 'memory' | 'plan' | 'files' | 'suffix';
	label: string;
	text: string;
}

/**
 * The prompt, section by section — same content assembleSystemPrompt joins,
 * exposed individually so context meters can price each part of every round.
 */
export function buildPromptSections(opts: AssemblePromptOpts): PromptSection[] {
	const sections: PromptSection[] = [];
	// Official assembly order: USER first, then BASE, then SUFFIX — your
	// instructions outrank the harness's own.
	if (opts.user && opts.user.trim())
		sections.push({ key: 'user', label: 'Your instructions', text: '# USER\n' + opts.user.trim() });
	sections.push({ key: 'base', label: 'Base harness prompt', text: '# BASE\n' + BASE_AGENT_PROMPT });

	if (opts.subagents?.length) {
		sections.push({
			key: 'subagents',
			label: 'Subagent roster',
			text:
				'## Available subagents\n' +
				opts.subagents.map((s) => `- ${s.name}: ${s.description}`).join('\n')
		});
	}
	if (opts.skills?.length) {
		sections.push({
			key: 'skills',
			label: 'Skill catalog',
			text:
				'## Skill catalog (progressive disclosure)\n' +
				'One line per skill. When a task matches a description, FIRST read the SKILL.md with read_file, then follow it exactly.\n' +
				opts.skills
					.map((s) => `- ${s.name}: ${s.description}${s.file ? ` (procedure: ${s.file})` : ''}`)
					.join('\n')
		});
	}
	if (opts.memorySummary && opts.memorySummary.trim()) {
		sections.push({
			key: 'memory',
			label: 'Persistent memory',
			text: '## Persistent memory\n' + opts.memorySummary.trim()
		});
	}
	if (opts.todos && opts.todos.length) {
		const block = opts.todos.map((t) => `- [${t.status}] ${t.content}`).join('\n');
		const open = opts.todos.filter((t) => t.status !== 'completed').length;
		sections.push({
			key: 'plan',
			label: 'Active plan',
			text:
				'## Active plan\n' +
				block +
				(open > 0
					? '\n(If any step above is already done, call write_todos NOW with the full updated list before anything else.)'
					: '')
		});
	}
	if (opts.files && opts.files.length) {
		sections.push({
			key: 'files',
			label: 'Workspace file list',
			text: '## Files in workspace\n' + opts.files.map((f) => `- ${f.path}`).join('\n')
		});
	}
	if (opts.suffix && opts.suffix.trim())
		sections.push({ key: 'suffix', label: 'Suffix', text: '# SUFFIX\n' + opts.suffix.trim() });
	return sections;
}

export function assembleSystemPrompt(opts: AssemblePromptOpts): string {
	const sections = buildPromptSections(opts);
	const parts: string[] = [];
	let middlewareOpen = false;
	for (const s of sections) {
		if (s.key === 'user' || s.key === 'base' || s.key === 'suffix') {
			parts.push(s.text);
			middlewareOpen = false;
		} else if (!middlewareOpen) {
			parts.push('# MIDDLEWARE\n' + s.text);
			middlewareOpen = true;
		} else {
			parts[parts.length - 1] += '\n\n' + s.text;
		}
	}
	return parts.join('\n\n');
}

export function makeSystemMessage(opts: AssemblePromptOpts) {
	return new SystemMessage(assembleSystemPrompt(opts));
}
