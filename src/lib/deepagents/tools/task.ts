import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SubAgentReport } from '../state';

export interface SubAgentSpec {
	name: string;
	description: string;
	prompt: string;
	run(input: { description: string; parentTopic?: string }): Promise<{ summary: string }>;
}

export interface TaskToolHooks {
	subagents: SubAgentSpec[];
	onSpawn?(name: string): void;
	onReturn?(report: SubAgentReport): void;
}

export function createTaskTool(hooks: TaskToolHooks) {
	const subagentEnum = hooks.subagents.length
		? (hooks.subagents.map((s) => s.name) as [string, ...string[]])
		: (['_none'] as [string, ...string[]]);

	return tool(
		async ({ subagent, description }) => {
			const spec = hooks.subagents.find((s) => s.name === subagent);
			if (!spec) {
				return `No subagent named "${subagent}". Available: ${hooks.subagents
					.map((s) => s.name)
					.join(', ')}`;
			}
			hooks.onSpawn?.(spec.name);
			const start = Date.now();
			const out = await spec.run({ description });
			const report: SubAgentReport = {
				name: spec.name,
				summary: out.summary,
				durationMs: Date.now() - start
			};
			hooks.onReturn?.(report);
			return out.summary;
		},
		{
			name: 'task',
			description:
				'Delegate a self-contained task to a named subagent. The subagent runs in its own context and returns a single concise summary. Use for research, drafting, or any work that would otherwise crowd this conversation.',
			schema: z.object({
				subagent: z.enum(subagentEnum).describe('The subagent to spawn.'),
				description: z
					.string()
					.describe('A clear, self-contained brief for the subagent.')
			})
		}
	);
}

export type SubAgentTool = ReturnType<typeof createTaskTool>;
