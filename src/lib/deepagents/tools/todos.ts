import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Todo } from '../state';

export interface TodosToolHooks {
	getTodos(): Todo[];
	setTodos(todos: Todo[]): void;
	onUpdate?(todos: Todo[]): void;
}

export function createWriteTodosTool(hooks: TodosToolHooks) {
	return tool(
		async ({ todos }) => {
			const sanitized = todos.map((t) => ({
				content: t.content,
				status: t.status as Todo['status']
			}));
			hooks.setTodos(sanitized);
			hooks.onUpdate?.(sanitized);
			return `Plan updated. ${sanitized.length} step${sanitized.length === 1 ? '' : 's'} (${
				sanitized.filter((t) => t.status === 'completed').length
			} completed, ${sanitized.filter((t) => t.status === 'in_progress').length} in progress).`;
		},
		{
			name: 'write_todos',
			description:
				'Replace the active to-do list with the provided plan. Use to plan, mark steps in_progress, and mark them completed. Always keep one step in_progress while working.',
			schema: z.object({
				todos: z
					.array(
						z.object({
							content: z.string(),
							status: z.enum(['pending', 'in_progress', 'completed'])
						})
					)
					.describe('The full new list of todos. Replaces the current list.')
			})
		}
	);
}
