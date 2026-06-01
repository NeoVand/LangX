import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SystemMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { runToolLoop } from './tool-loop';
import type { OnStep } from './types';

interface Task {
	id: number;
	title: string;
	assignee: string;
	priority: 'low' | 'medium' | 'high';
	due?: string;
}

const SYSTEM = `You are a team assistant that manages a shared task list. Use create_task to add work and list_tasks to review it. When the user asks you to do something, take the action with the tools rather than just describing it, then confirm what you did in one short sentence.`;

/** The toolbox the model chooses from — shown in the demo's inspector. */
export const actionToolSpecs = [
	{
		name: 'create_task',
		description: 'Add a task to the shared list (mutates state).',
		params: ['title', 'assignee', 'priority', 'due?']
	},
	{ name: 'list_tasks', description: 'List tasks, optionally filtered by assignee.', params: ['assignee?'] }
];

/**
 * Tools don't only read — they ACT. Here two tools share an in-memory task list:
 * create_task mutates it, list_tasks reads it. The model extracts typed arguments
 * (including a priority enum) from a casual request, performs the action, and reads
 * the result back. This is the exact source the demo runs.
 */
export async function runActionDemo(
	request: string,
	onMessages: (messages: BaseMessage[]) => void,
	onStep: OnStep
): Promise<BaseMessage[]> {
	// Fresh state per run, seeded with a couple of existing tasks for context.
	const tasks: Task[] = [
		{ id: 1, title: 'Review Q3 metrics', assignee: 'Grace', priority: 'medium', due: 'Wed' },
		{ id: 2, title: 'Update onboarding docs', assignee: 'Ada', priority: 'low', due: 'next week' }
	];
	let nextId = 3;

	const createTask = tool(
		async ({ title, assignee, priority, due }) => {
			const task: Task = { id: nextId++, title, assignee, priority, due };
			tasks.push(task);
			return `Created task #${task.id}: "${title}" for ${assignee} (${priority}${due ? `, due ${due}` : ''}).`;
		},
		{
			name: 'create_task',
			description: 'Add a task to the shared list. Returns a confirmation with the new task id.',
			schema: z.object({
				title: z.string().describe('What needs doing.'),
				assignee: z.string().describe('Who it is for.'),
				priority: z.enum(['low', 'medium', 'high']),
				due: z.string().optional().describe('When it is due, if mentioned.')
			})
		}
	);

	const listTasks = tool(
		async ({ assignee }) => {
			const rows = assignee
				? tasks.filter((t) => t.assignee.toLowerCase() === assignee.toLowerCase())
				: tasks;
			return JSON.stringify(rows);
		},
		{
			name: 'list_tasks',
			description: 'List tasks, optionally filtered by assignee. Returns rows as JSON.',
			schema: z.object({
				assignee: z.string().optional().describe('Filter to one person, or omit for all.')
			})
		}
	);

	const tools = [createTask, listTasks];
	const model = (await getModel({ temperature: 0, maxTokens: 400 })).bindTools!(tools);
	const messages: BaseMessage[] = [new SystemMessage(SYSTEM), new HumanMessage(request)];
	return runToolLoop({ model, tools, messages, onMessages, onStep });
}
