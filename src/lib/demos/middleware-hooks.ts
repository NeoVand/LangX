/**
 * Middleware & hooks, made concrete. A middleware is a layer with optional
 * `before` and `after` hooks; we wrap a single model call in a stack of them.
 * `before` hooks run top-to-bottom (they can rewrite the prompt); `after` hooks
 * run bottom-to-top (they can rewrite the reply) — the classic "onion".
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';

export interface TurnContext {
	system: string;
	user: string;
}

export interface Middleware {
	name: string;
	/** Runs before the model — may rewrite the system/user prompt. */
	before?: (ctx: TurnContext) => TurnContext;
	/** Runs after the model — may rewrite the answer. */
	after?: (answer: string) => string;
}

export interface HookEvent {
	phase: 'before' | 'after' | 'model';
	name: string;
	note: string;
}

export const BASE_SYSTEM = 'You are a helpful assistant. Answer in one short sentence.';

/** The catalog the lesson toggles on and off. */
export const MIDDLEWARES: Record<string, Middleware> = {
	persona: {
		name: 'persona',
		before: (ctx) => ({ ...ctx, system: ctx.system + ' Speak like a Victorian inventor.' })
	},
	guard: {
		name: 'guard',
		before: (ctx) => ({ ...ctx, user: ctx.user.replace(/\b(password|secret|api[- ]?key)\b/gi, '[redacted]') })
	},
	stamp: {
		name: 'stamp',
		after: (answer) => answer.trim() + '\n\n— stamped by middleware'
	}
};

export async function runWithMiddleware(
	user: string,
	middlewares: Middleware[],
	onEvent: (e: HookEvent) => void
): Promise<string> {
	let ctx: TurnContext = { system: BASE_SYSTEM, user };

	// before hooks: top → bottom
	for (const m of middlewares) {
		if (!m.before) continue;
		const next = m.before(ctx);
		const changed = next.system !== ctx.system ? 'edited system prompt' : 'edited user message';
		onEvent({ phase: 'before', name: m.name, note: changed });
		ctx = next;
	}

	onEvent({ phase: 'model', name: 'model', note: 'invoke(system + user)' });
	const model = await getModel({ temperature: 0.2, maxTokens: 200 });
	const ai = await model.invoke([new SystemMessage(ctx.system), new HumanMessage(ctx.user)]);
	let answer = displayContent(ai.content);

	// after hooks: bottom → top (unwinding the onion)
	for (const m of [...middlewares].reverse()) {
		if (!m.after) continue;
		answer = m.after(answer);
		onEvent({ phase: 'after', name: m.name, note: 'edited the reply' });
	}

	return answer;
}
