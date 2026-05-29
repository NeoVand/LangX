import {
	createDeepAgent,
	StateBackend,
	type SubAgentSpec,
	type SubAgentReport
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

export interface SubagentsRunResult {
	events: TraceEvent[];
	reports: SubAgentReport[];
	finalText: string;
}

export interface SubagentsDemoCallbacks {
	/** Live subagent reports as each delegated task returns. */
	onReports?: (reports: SubAgentReport[]) => void;
	/** Live trace events (the whole list, growing). */
	onTrace?: (events: TraceEvent[]) => void;
}

const SUBAGENT_PROMPTS: Record<string, string> = {
	researcher: `You are a research assistant. The user will give you a sub-question.
Reply with a single short paragraph (≤ 60 words) summarising what you would find — invent
plausible primary sources and one-line takeaways. Do not call tools. Do not chat. Reply
with prose only.`,
	writer: `You are a technical writer. The user will give you a topic and findings.
Reply with a single short paragraph (≤ 60 words) describing the brief you would write,
including how many sections and rough citation count. Do not call tools.`,
	critic: `You are an editorial critic. The user will give you a brief. Reply with at
most three terse bullet notes, one per line, each beginning with "- ". Do not call tools.`
};

function makeSubagent(name: keyof typeof SUBAGENT_PROMPTS): SubAgentSpec {
	return {
		name,
		description: `Run the ${name} subagent for a focused task.`,
		prompt: SUBAGENT_PROMPTS[name],
		// Each subagent gets its own isolated model invocation — fresh context window.
		run: async (input) => {
			const model = await getModel({ temperature: 0.3, maxTokens: 220 });
			const response = await model.invoke([
				new SystemMessage(SUBAGENT_PROMPTS[name]),
				new HumanMessage(input.description)
			]);
			const text =
				typeof response.content === 'string'
					? response.content
					: JSON.stringify(response.content);
			return { summary: text.trim() };
		}
	};
}

const INSTRUCTIONS = `You are a research lead. You have three subagents: researcher, writer, critic.
To brief the user, you must call task three times in this exact order:
1. task({ subagent: 'researcher', description: 'Find 3 reputable sources on stateful agent runtimes and extract claims.' })
2. task({ subagent: 'writer', description: 'Draft a 1-page brief on stateful agent runtimes citing the researcher findings.' })
3. task({ subagent: 'critic', description: 'Critique the brief for clarity, accuracy, and citation discipline.' })

You may NOT do the research yourself. You may NOT write the brief yourself. Delegate.
After the third task returns, reply with one short summary sentence mentioning the three handoffs.`;

/**
 * Drives a research lead that delegates to three ephemeral subagents
 * (researcher → writer → critic) via the task tool, each running its own model
 * invocation in isolation. Live reports + trace stream out through callbacks.
 * This is the exact source the demo runs.
 */
export async function runSubagentsDemo(
	cb: SubagentsDemoCallbacks = {}
): Promise<SubagentsRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── Harness: SubAgentMiddleware + task tool ───────────────────────────────
	const subagents = [makeSubagent('researcher'), makeSubagent('writer'), makeSubagent('critic')];
	const model = await getModel({ temperature: 0, maxTokens: 600 });
	const agent = createDeepAgent({
		model,
		backend: new StateBackend(),
		subagents,
		instructions: INSTRUCTIONS,
		tracer,
		maxIterations: 14
	});
	agent.subscribe((s) => cb.onReports?.([...s.subagentReports]));

	const out = await agent.invoke({
		input: 'Brief me on stateful agent runtimes.',
		thread: `sub-${Math.random().toString(36).slice(2, 6)}`
	});
	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	return {
		events: localEvents,
		reports: out.subagentReports,
		finalText: text
	};
}
