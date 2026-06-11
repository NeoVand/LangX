import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SubAgentReport } from '../state';
import type { BackendProtocol } from '../backends';
import type { FilesystemPermission } from '../permissions';
import { buildFilesystemTools } from './filesystem';

/** Minimal structural view of a LangChain tool — enough to execute it. */
export interface ChildTool {
	name: string;
	invoke(args: unknown): Promise<unknown>;
}

/**
 * Official SubAgent shape (docs: deepagents/subagents). Inheritance matrix:
 *  - systemPrompt: NEVER inherited — every child states its own.
 *  - tools: inherits the parent's custom tools by default; when set, REPLACES
 *    them entirely (filesystem tools persist — they come from the child's own
 *    middleware, not from inheritance).
 *  - model: inherits the parent's when omitted.
 *  - permissions: inherits the parent's; when set, REPLACES them entirely.
 */
export interface SubAgentSpec {
	name: string;
	description: string;
	systemPrompt?: string;
	/** @deprecated legacy alias for `systemPrompt`. */
	prompt?: string;
	tools?: ChildTool[];
	model?: BaseChatModel;
	permissions?: FilesystemPermission[];
	/** Model rounds the child may take before it must report. Default 12. */
	maxIterations?: number;
	/**
	 * CompiledSubAgent analogue: bring your own runnable instead of letting the
	 * harness run a child agent loop. The official package accepts any compiled
	 * LangGraph graph here; locally it's a callback.
	 */
	run?(input: { description: string }): Promise<{ summary: string }>;
}

/** A live event from inside a running child — for cockpit UIs, via the tracer. */
export interface ChildEvent {
	type: 'spawn' | 'tool' | 'done' | 'error';
	agent: string;
	/** Tool name for 'tool', report head for 'done', message for 'error'. */
	detail?: string;
	data?: Record<string, unknown>;
}

const CHILD_BASE_PROMPT = `You are a subagent: you were handed ONE self-contained task by a parent agent.
Complete it with your tools, then reply with a single concise report — that report is the ONLY
thing the parent will ever see of your work. Never ask questions; decide and act. If a tool
rejects your input, read the error, fix your input, and try again.`;

const GENERAL_PURPOSE: SubAgentSpec = {
	name: 'general-purpose',
	description:
		'General-purpose agent for complex, multi-step tasks. Inherits the parent agent\'s tools.',
	systemPrompt:
		'You are a capable general-purpose agent. Complete the task you are given end-to-end ' +
		'using your tools, then reply with one concise report of what you did and found.'
};

/**
 * The official harness auto-adds a `general-purpose` subagent unless you
 * declare one with that name yourself (in which case your spec replaces it).
 */
export function withGeneralPurpose(specs: SubAgentSpec[]): SubAgentSpec[] {
	return specs.some((s) => s.name === 'general-purpose') ? specs : [...specs, GENERAL_PURPOSE];
}

function textOf(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((b) => (typeof b === 'string' ? b : ((b as { text?: string }).text ?? '')))
			.join('');
	}
	return JSON.stringify(content ?? '');
}

export interface ChildRunOptions {
	spec: SubAgentSpec;
	description: string;
	/** Parent's model — the child's fallback when its spec doesn't override. */
	model: BaseChatModel;
	/** The SAME backend the parent uses — parent and children share one filesystem. */
	backend: BackendProtocol;
	/** Parent's custom tools — inherited unless the spec replaces them. */
	parentTools: ChildTool[];
	parentPermissions: FilesystemPermission[];
	onEvent?: (ev: ChildEvent) => void;
	/** Cooperative cancellation — checked between model rounds (async tasks). */
	shouldAbort?: () => boolean;
	/**
	 * Steering restart (async `update_async_task`): the child's prior transcript;
	 * `description` is then appended as a NEW human instruction on top of it.
	 */
	priorMessages?: BaseMessage[];
}

export interface ChildRunResult {
	summary: string;
	steps: number;
	toolCalls: number;
	/** Full child transcript — kept for steering restarts; the parent never sees it. */
	messages: BaseMessage[];
	aborted?: boolean;
}

/**
 * A real child agent loop: own system prompt, own context window, own tool
 * loop — sharing the parent's filesystem backend. This is what `task` spawns.
 * Children cannot summon a human (interrupt() is parent-graph-only in the
 * browser), so permission rules in 'interrupt' mode harden to 'deny' here.
 */
export async function runChildAgent(o: ChildRunOptions): Promise<ChildRunResult> {
	const spec = o.spec;
	const sys = spec.systemPrompt ?? spec.prompt ?? GENERAL_PURPOSE.systemPrompt!;
	const childPermissions = (spec.permissions ?? o.parentPermissions).map((r) =>
		r.mode === 'interrupt' ? { ...r, mode: 'deny' as const } : r
	);
	const fsTools = buildFilesystemTools({
		backend: o.backend,
		permissions: childPermissions
	}) as unknown as ChildTool[];
	const custom = spec.tools ?? o.parentTools;
	const tools = [...fsTools.filter((f) => !custom.some((c) => c.name === f.name)), ...custom];
	const toolByName = new Map(tools.map((t) => [t.name, t]));
	const model = spec.model ?? o.model;
	const bound = (
		model as unknown as { bindTools: (t: ChildTool[]) => { invoke: (m: BaseMessage[]) => Promise<AIMessage> } }
	).bindTools(tools);

	const messages: BaseMessage[] = o.priorMessages
		? [...o.priorMessages, new HumanMessage(o.description)]
		: [
				new SystemMessage(`${sys}\n\n${CHILD_BASE_PROMPT}`),
				new HumanMessage(o.description)
			];

	let steps = 0;
	let toolCalls = 0;
	const maxIterations = spec.maxIterations ?? 12;

	for (let round = 0; round < maxIterations; round++) {
		if (o.shouldAbort?.()) return { summary: '(cancelled)', steps, toolCalls, messages, aborted: true };
		const ai = await bound.invoke(messages);
		steps++;
		// Halted mid-round? Drop this AI message rather than keep a possibly
		// dangling tool_calls entry — a steering restart replays this transcript,
		// and unanswered tool calls would poison it (officially this repair is
		// PatchToolCallsMiddleware's job).
		if (o.shouldAbort?.()) return { summary: '(cancelled)', steps, toolCalls, messages, aborted: true };
		messages.push(ai);

		const calls = ai.tool_calls ?? [];
		if (!calls.length) {
			const summary = textOf(ai.content).trim();
			o.onEvent?.({ type: 'done', agent: spec.name, detail: summary.slice(0, 96) });
			return { summary, steps, toolCalls, messages };
		}
		for (const tc of calls) {
			toolCalls++;
			o.onEvent?.({ type: 'tool', agent: spec.name, detail: tc.name, data: { args: tc.args } });
			const t = toolByName.get(tc.name);
			let content: string;
			if (!t) {
				content = `Unknown tool: ${tc.name}`;
			} else {
				try {
					const result = await t.invoke(tc.args);
					content = typeof result === 'string' ? result : JSON.stringify(result);
				} catch (e) {
					content = `Tool ${tc.name} failed: ${e instanceof Error ? e.message : String(e)}`;
				}
			}
			messages.push(new ToolMessage({ content, tool_call_id: tc.id ?? '', name: tc.name }));
		}
	}
	return {
		summary: '(subagent hit its iteration limit before reporting)',
		steps,
		toolCalls,
		messages
	};
}

export interface TaskToolHooks {
	subagents: SubAgentSpec[];
	model: BaseChatModel;
	backend: BackendProtocol;
	parentTools: ChildTool[];
	permissions: FilesystemPermission[];
	onSpawn?(name: string, description: string): void;
	onChildEvent?(ev: ChildEvent): void;
	onReturn?(report: SubAgentReport): void;
}

/**
 * The `task` tool — delegation made first-class. Official signature:
 * task({ subagent_type, description }). The child runs to completion in its own
 * context; the parent receives exactly one string back.
 */
export function createTaskTool(hooks: TaskToolHooks) {
	const roster = withGeneralPurpose(hooks.subagents);
	const names = roster.map((s) => s.name) as [string, ...string[]];

	return tool(
		async ({ subagent_type, description }) => {
			const spec = roster.find((s) => s.name === subagent_type);
			if (!spec) {
				return `No subagent named "${subagent_type}". Available: ${names.join(', ')}`;
			}
			hooks.onSpawn?.(spec.name, description);
			const start = Date.now();
			try {
				let summary: string;
				let steps = 1;
				let toolCalls = 0;
				if (spec.run) {
					// CompiledSubAgent path: the spec brings its own runnable.
					summary = (await spec.run({ description })).summary;
				} else {
					const out = await runChildAgent({
						spec,
						description,
						model: hooks.model,
						backend: hooks.backend,
						parentTools: hooks.parentTools,
						parentPermissions: hooks.permissions,
						onEvent: hooks.onChildEvent
					});
					summary = out.summary;
					steps = out.steps;
					toolCalls = out.toolCalls;
				}
				const report: SubAgentReport = {
					name: spec.name,
					summary,
					durationMs: Date.now() - start,
					steps,
					toolCalls
				};
				hooks.onReturn?.(report);
				return summary;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				hooks.onChildEvent?.({ type: 'error', agent: spec.name, detail: msg });
				return `Subagent ${subagent_type} failed: ${msg}`;
			}
		},
		{
			name: 'task',
			description:
				'Delegate a self-contained task to a subagent. The subagent runs in its own context ' +
				'window with its own tools and returns ONE concise report — you never see its ' +
				'intermediate steps. To run subagents in PARALLEL, emit several task calls in a ' +
				'single response. Each description must be fully self-contained: the subagent ' +
				'cannot see this conversation.',
			schema: z.object({
				subagent_type: z.enum(names).describe('Which subagent to spawn.'),
				description: z
					.string()
					.describe('A complete, self-contained brief for the subagent.')
			})
		}
	);
}

export type SubAgentTool = ReturnType<typeof createTaskTool>;
