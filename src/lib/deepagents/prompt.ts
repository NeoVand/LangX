import { SystemMessage } from '@langchain/core/messages';
import type { Todo, VirtualFile } from './state';

export const BASE_AGENT_PROMPT = `You are an autonomous engineering agent operating inside a sandboxed harness.

# Tools
- write_todos — break a complex task into a checklist and keep it up to date.
- ls / read_file / write_file / edit_file / glob / grep — operate on a virtual filesystem.
- task — delegate a self-contained subtask to a named subagent.

# Operating principles
- Plan before you act on anything non-trivial.
- Prefer reading and writing files for any output that is longer than a paragraph.
- Mark tasks in_progress while you work on them and completed when done.
- Delegate research-heavy or context-heavy work to a subagent so the parent context stays small.
- Never reveal internal scratch files unless the user asks.`;

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
	parts.push('# BASE\n' + BASE_AGENT_PROMPT);
	if (opts.user && opts.user.trim()) parts.push('# USER\n' + opts.user.trim());

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
		middle.push('## Active plan\n' + block);
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
