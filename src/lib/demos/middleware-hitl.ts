/**
 * Human-in-the-loop, for real. A support agent can look up orders freely, but
 * issuing a refund moves real money — so we put that tool behind an approval gate.
 *
 * In production you'd add this with one line — `humanInTheLoopMiddleware` on a
 * `createAgent` (see the lesson). Here we wire the same gate as an explicit
 * LangGraph so it runs live in the browser: the `tools` node calls `interrupt()`
 * before a gated tool, which pauses the run (its state held by a checkpointer)
 * until a human approves, edits, or rejects — then `Command({ resume })` continues.
 * This is exactly what the middleware compiles to.
 */
// Import the main entry, not `/web`: in the browser Vite's "browser" condition
// resolves this to the same web build (so the in-app demo works with the
// async-context shim in hooks.client.ts), while in Node — e.g. the downloadable
// project run under tsx — it resolves to the build backed by real
// node:async_hooks, so interrupt()/HITL works there with no extra setup.
import {
	StateGraph,
	MessagesAnnotation,
	MemorySaver,
	Command,
	START,
	END,
	interrupt
} from '@langchain/langgraph';
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { getModel } from '$lib/runtime/llm';

// ── A tiny in-browser "orders" database the support agent can read ──────────
interface Order {
	customer: string;
	item: string;
	total: number;
	placed: string;
	status: string;
}
export const ORDERS: Record<string, Order> = {
	A1024: {
		customer: 'Maya Chen',
		item: 'Aurora Espresso Machine',
		total: 149,
		placed: '2026-05-22',
		status: 'delivered'
	},
	B2210: {
		customer: 'Liam Ortiz',
		item: 'Aurora Milk Frother',
		total: 39,
		placed: '2026-05-28',
		status: 'delivered'
	}
};

/** READ tool — safe, so it is auto-approved (never gated). */
export const lookupOrderTool = tool(
	async ({ order_id }) => {
		const order = ORDERS[order_id.trim().toUpperCase()];
		if (!order) return `No order found with id "${order_id}".`;
		return JSON.stringify({ order_id: order_id.trim().toUpperCase(), ...order });
	},
	{
		name: 'lookup_order',
		description: 'Look up an order by its id. Returns the customer, item, total, and status.',
		schema: z.object({
			order_id: z.string().describe('The order id, e.g. "A1024".')
		})
	}
);

/** WRITE tool — moves real money, so we put it behind a human approval gate. */
export const issueRefundTool = tool(
	async ({ order_id, amount, reason }) => {
		const order = ORDERS[order_id.trim().toUpperCase()];
		if (!order) return `Cannot refund: no order "${order_id}".`;
		return (
			`✅ Refunded $${amount.toFixed(2)} to ${order.customer} for order ` +
			`${order_id.trim().toUpperCase()} (${order.item}). Reason: ${reason}. ` +
			`A confirmation email has been sent.`
		);
	},
	{
		name: 'issue_refund',
		description:
			'Issue a refund to the customer for an order. This moves money and cannot be undone.',
		schema: z.object({
			order_id: z.string().describe('The order id to refund.'),
			amount: z.number().describe('The refund amount in dollars.'),
			reason: z.string().describe('A short reason for the refund.')
		})
	}
);

export const supportTools = [lookupOrderTool, issueRefundTool];

// Looser type so we can call .invoke(args) with a generic arg object by name.
type RunnableTool = { invoke: (args: Record<string, unknown>) => Promise<unknown> };
const toolByName = new Map<string, RunnableTool>(
	supportTools.map((t) => [t.name, t as unknown as RunnableTool])
);

/** Tools that require human approval before they run. */
const GATED = new Set(['issue_refund']);
const GATE_DESCRIPTION = 'This issues a real refund. Review the amount before approving.';

export const DEFAULT_SYSTEM_PROMPT =
	'You are a support agent for Aurora, an online coffee-equipment store. ' +
	'Always look up the order before acting. When a customer reports a defective or ' +
	'damaged item, issue a refund for the order total. When you confirm a refund, state ' +
	'the EXACT amount reported by the refund tool (it may differ from what you requested ' +
	'if a reviewer adjusted it). Be warm and concise.';

export const DEFAULT_USER_PROMPT =
	"My Aurora Espresso Machine (order A1024) arrived with a cracked carafe. I'd like a refund, please.";

/** Tool catalog for the demo's toolbox — `gated` marks the approval-gated tool. */
export const hitlToolSpecs = [
	{
		name: 'lookup_order',
		description: 'Look up an order by its id. Returns the customer, item, total, and status.',
		params: ['order_id'],
		exportName: 'lookupOrderTool',
		gated: false
	},
	{
		name: 'issue_refund',
		description: 'Issue a refund to the customer. Moves money and cannot be undone.',
		params: ['order_id', 'amount', 'reason'],
		exportName: 'issueRefundTool',
		gated: true
	}
];

// ── Decisions & pending actions (same shape LangChain's HITL middleware uses) ─

export type ReviewDecision =
	| { type: 'approve' }
	| { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } }
	| { type: 'reject'; message?: string }
	| { type: 'respond'; message: string };

export interface PendingAction {
	name: string;
	args: Record<string, unknown>;
	description?: string;
	allowedDecisions: ('approve' | 'edit' | 'reject' | 'respond')[];
}

// ── The agent graph: model → (gated) tools → model → … ──────────────────────

function buildAgent(model: BaseChatModel, systemPrompt: string, checkpointer: MemorySaver) {
	const bound = model.bindTools!(supportTools);

	return (
		new StateGraph(MessagesAnnotation)
			.addNode('model_request', async (state) => {
				const ai = await bound.invoke([new SystemMessage(systemPrompt), ...state.messages]);
				return { messages: [ai] };
			})
			.addNode('tools', async (state) => {
				const last = state.messages[state.messages.length - 1] as AIMessage;
				const calls = last.tool_calls ?? [];
				const gated = calls.filter((c) => GATED.has(c.name));

				// interrupt() MUST be the first thing (synchronous), before any await —
				// that's how its run-context survives in the browser. It pauses here and
				// returns the human's decisions when the run is resumed.
				let decisions: ReviewDecision[] = [];
				if (gated.length) {
					const response = interrupt({
						actionRequests: gated.map((c) => ({
							name: c.name,
							args: c.args ?? {},
							description: GATE_DESCRIPTION
						})),
						reviewConfigs: gated.map((c) => ({
							actionName: c.name,
							allowedDecisions: ['approve', 'edit', 'reject']
						}))
					}) as { decisions?: ReviewDecision[] } | undefined;
					decisions = response?.decisions ?? [];
				}

				// Now run the tools (approved/edited) or return the rejection message.
				const out: BaseMessage[] = [];
				let gi = 0;
				for (const c of calls) {
					const id = c.id ?? '';
					if (GATED.has(c.name)) {
						const d = decisions[gi++] ?? { type: 'approve' };
						if (d.type === 'reject') {
							out.push(
								new ToolMessage({
									content: `The reviewer rejected this ${c.name}.${d.message ? ' ' + d.message : ''}`,
									tool_call_id: id,
									name: c.name
								})
							);
							continue;
						}
						const args = d.type === 'edit' ? d.editedAction.args : (c.args ?? {});
						const result = await toolByName.get(c.name)!.invoke(args);
						out.push(new ToolMessage({ content: String(result), tool_call_id: id, name: c.name }));
					} else {
						const result = await toolByName.get(c.name)!.invoke(c.args ?? {});
						out.push(new ToolMessage({ content: String(result), tool_call_id: id, name: c.name }));
					}
				}
				return { messages: out };
			})
			.addEdge(START, 'model_request')
			.addConditionalEdges(
				'model_request',
				(state) => {
					const last = state.messages[state.messages.length - 1] as AIMessage;
					return last.tool_calls?.length ? 'tools' : END;
				},
				['tools', END]
			)
			.addEdge('tools', 'model_request')
			.compile({ checkpointer })
	);
}

interface AgentResult {
	messages?: BaseMessage[];
	__interrupt__?: { value?: { actionRequests?: ActionReq[]; reviewConfigs?: ReviewCfg[] } }[];
}
interface ActionReq {
	name: string;
	args?: Record<string, unknown>;
	description?: string;
}
interface ReviewCfg {
	actionName: string;
	allowedDecisions: ('approve' | 'edit' | 'reject' | 'respond')[];
}

type SupportAgent = ReturnType<typeof buildAgent>;
type RunConfig = { configurable: { thread_id: string } };

// The paused run lives here between "start" and the human's decision.
let session: { agent: SupportAgent; config: RunConfig } | null = null;
// Each run gets a fresh checkpointer, so a simple incrementing thread id is
// enough (and avoids depending on crypto.randomUUID across runtimes).
let runSeq = 0;

function readPending(result: AgentResult): PendingAction[] | null {
	const value = result.__interrupt__?.[0]?.value;
	if (!value?.actionRequests?.length) return null;
	const allowed = new Map(
		(value.reviewConfigs ?? []).map((r) => [r.actionName, r.allowedDecisions])
	);
	return value.actionRequests.map((a) => ({
		name: a.name,
		args: a.args ?? {},
		description: a.description,
		allowedDecisions: allowed.get(a.name) ?? ['approve', 'reject']
	}));
}

/** Start a run. Resolves when the agent answers OR pauses at a gated tool. */
export async function startSupportAgent(
	systemPrompt: string,
	userPrompt: string
): Promise<{ messages: BaseMessage[]; pending: PendingAction[] | null }> {
	const model = await getModel({ temperature: 0, maxTokens: 1024 });
	const checkpointer = new MemorySaver();
	const agent = buildAgent(model, systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT, checkpointer);
	const config: RunConfig = { configurable: { thread_id: `support-${++runSeq}` } };
	session = { agent, config };

	const result = (await agent.invoke(
		{ messages: [new HumanMessage(userPrompt?.trim() || DEFAULT_USER_PROMPT)] },
		config
	)) as AgentResult;

	return { messages: result.messages ?? [], pending: readPending(result) };
}

/** Resume the paused run with the human's decision. */
export async function resolveDecision(
	decision: ReviewDecision
): Promise<{ messages: BaseMessage[]; pending: PendingAction[] | null }> {
	if (!session) throw new Error('No paused agent run to resume — start the agent first.');
	const { agent, config } = session;
	const result = (await agent.invoke(
		new Command({ resume: { decisions: [decision] } }),
		config
	)) as AgentResult;
	return { messages: result.messages ?? [], pending: readPending(result) };
}
