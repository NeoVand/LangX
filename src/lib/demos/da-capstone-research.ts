import {
	createDeepAgent,
	StateBackend,
	StoreBackend,
	CompositeBackend,
	type SubAgentSpec,
	type SubAgentReport,
	type Todo,
	type VirtualFile
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

const SUBAGENT_PROMPTS: Record<string, string> = {
	researcher: `You are a research assistant. The user will give you a focused sub-question.
Reply with a tight paragraph (≤ 70 words): two or three plausible primary sources and a single
key claim from each. Invent reasonable sources where you do not have direct knowledge. Do not
call tools. Do not chat — prose only.`,
	writer: `You are a technical writer. The user will give you a topic and a packet of
findings. Reply with a short paragraph (≤ 80 words) describing the brief you would write:
how many sections, the angle, and rough citation count. Do not call tools.`,
	critic: `You are an editorial critic. The user will give you a brief description.
Reply with at most three terse bullet notes, one per line, each beginning with "- ".
Notes should be specific (clarity, accuracy, citation discipline). Do not call tools.`
};

function makeSubagent(name: keyof typeof SUBAGENT_PROMPTS): SubAgentSpec {
	return {
		name,
		description: `Run the ${name} subagent for a focused task.`,
		prompt: SUBAGENT_PROMPTS[name],
		run: async (input) => {
			const model = await getModel({ temperature: 0.3, maxTokens: 260 });
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

const instructionsFor = (t: string) => `You are a research lead capstone. You have three subagents:
researcher, writer, critic. The user wants a brief on: "${t}".

Follow this recipe exactly:
1. write_todos with this 5-step plan, first step in_progress:
   - Decompose the question
   - Research sub-questions in parallel
   - Draft the brief
   - Critique the brief
   - Save to /memories/

2. write_file('/scratch/sub_questions.md', <3 numbered sub-questions about the topic>) — then update todos.
3. For each of the three sub-questions, call task({ subagent: 'researcher', description: <sub-question> }). Update todos as you go.
4. task({ subagent: 'writer',  description: 'Write a 1-page brief on "${t}" citing the researcher findings.' })
5. task({ subagent: 'critic',  description: 'Critique the brief.' })
6. write_file('/memories/${t
	.replace(/\s+/g, '-')
	.toLowerCase()
	.replace(/[^a-z0-9-]/g, '')}.md', '# ${t}\\n\\n…') — a short markdown brief (≤ 200 words) summarising the work.
7. Final write_todos with all 5 steps completed.
8. Reply with one sentence confirming the brief was saved to /memories/.

Do NOT do the research, writing, or critique yourself — delegate everything via task.`;

export interface ResearchRunResult {
	topic: string;
	todos: Todo[];
	files: VirtualFile[];
	events: TraceEvent[];
	reports: SubAgentReport[];
	finalText: string;
}

export interface ResearchCallbacks {
	/** Live trace events (the whole list, growing) as the run progresses. */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live plan / filesystem / subagent-report snapshot on each state change. */
	onProgress?: (snapshot: {
		todos: Todo[];
		files: VirtualFile[];
		reports: SubAgentReport[];
	}) => void;
}

/**
 * The deep-research capstone: a parent agent plans, fans three sub-questions out
 * to researcher subagents, hands the findings to a writer then a critic, and
 * publishes the final brief to /memories/ via a CompositeBackend routed to a
 * durable StoreBackend. Plan / filesystem / report / trace updates stream out
 * through the callbacks. This is the exact source the demo runs.
 */
export async function runResearchCapstone(
	topic: string,
	cb: ResearchCallbacks = {}
): Promise<ResearchRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── CompositeBackend: scratch ephemeral, /memories/ durable ───────────────
	const backend = new CompositeBackend(
		[
			{
				prefix: '/memories/',
				backend: new StoreBackend('research-capstone')
			}
		],
		new StateBackend()
	);

	// ── Full harness: todos + filesystem + subagents + durable memory ───────
	const model = await getModel({ temperature: 0.1, maxTokens: 800 });
	const agent = createDeepAgent({
		model,
		backend,
		subagents: [makeSubagent('researcher'), makeSubagent('writer'), makeSubagent('critic')],
		instructions: instructionsFor(topic),
		tracer,
		maxIterations: 40
	});
	agent.subscribe((s) => {
		cb.onProgress?.({
			todos: [...s.todos],
			files: [...s.files],
			reports: [...s.subagentReports]
		});
	});

	const out = await agent.invoke({
		input: `Brief me on ${topic}.`,
		thread: `capstone-${Math.random().toString(36).slice(2, 6)}`
	});
	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	return {
		topic,
		todos: out.todos,
		files: await backend.list(),
		events: localEvents,
		reports: out.subagentReports,
		finalText: text
	};
}
