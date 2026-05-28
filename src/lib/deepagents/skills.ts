import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export interface Skill {
	name: string;
	description: string;
	body: string;
}

export interface SkillsHooks {
	skills: Skill[];
	onLoad?(name: string): void;
}

/**
 * Implements the progressive-disclosure pattern:
 *  - Only `{name, description}` for each skill ships in the system prompt.
 *  - Calling `load_skill(name)` returns the full body, paying the token cost
 *    only when the agent actually needs it.
 */
export function createLoadSkillTool(hooks: SkillsHooks) {
	const enumNames = hooks.skills.length
		? (hooks.skills.map((s) => s.name) as [string, ...string[]])
		: (['_none'] as [string, ...string[]]);
	return tool(
		async ({ name }) => {
			const skill = hooks.skills.find((s) => s.name === name);
			if (!skill) {
				return `Skill not found: ${name}. Available: ${hooks.skills.map((s) => s.name).join(', ')}`;
			}
			hooks.onLoad?.(name);
			return skill.body;
		},
		{
			name: 'load_skill',
			description:
				'Load the full body of a skill from the catalog. Use only when the skill description suggests it is relevant to the task.',
			schema: z.object({ name: z.enum(enumNames) })
		}
	);
}
