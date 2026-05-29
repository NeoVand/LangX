import { createDeepAgent, StateBackend, type Skill, type VirtualFile } from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

/** Progressive-disclosure skill catalog: only {name, description} ship in the prompt. */
export const SKILLS: Skill[] = [
	{
		name: 'cite',
		description:
			'Insert proper citations for every claim in the form [Author, Year] with a sources block at the end.',
		body: `# cite

1. After each non-trivial claim, append [Author, Year].
2. At the end of the document, add a "Sources" section with a numbered list and full URLs.
3. Prefer primary sources. Avoid secondary aggregators.`
	},
	{
		name: 'shrink',
		description:
			'Reduce a markdown document by ~40% while preserving every numeric claim, every URL, and the original section headings.',
		body: `# shrink

1. Run a frequency analysis on adjectives and adverbs; remove weak ones.
2. Collapse list items that share a verb.
3. Never delete a number, a date, or a URL.
4. Keep section headings exactly as they were.`
	},
	{
		name: 'eli12',
		description:
			'Rewrite the input to be understandable to a smart 12-year-old. Maintain accuracy.',
		body: `# eli12

1. Replace jargon with plain words. Keep proper nouns.
2. Use ≤15-word sentences when possible.
3. Lead each paragraph with a concrete example.`
	}
];

export interface SkillsRunResult {
	events: TraceEvent[];
	files: VirtualFile[];
	finalText: string;
}

export interface SkillsDemoCallbacks {
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
	/** Live trace events (the whole list, growing). */
	onTrace?: (events: TraceEvent[]) => void;
}

const INSTRUCTIONS = `You are writing a short paragraph and citing it properly.

Process:
1. First call load_skill({ name: 'cite' }) — read the returned skill body carefully.
2. Then write_file('/draft.md', <one paragraph applying the cite skill, with a Sources section>).
3. Do not load any other skills. Do not chat between tool calls.
4. End with one short summary sentence.`;

/**
 * Drives an agent over a progressive-disclosure skill catalog: only the skill
 * names + descriptions ship in the system prompt, and the full body of `cite`
 * arrives only when the agent calls load_skill. Live filesystem + trace stream
 * out through callbacks.
 * This is the exact source the demo runs.
 */
export async function runSkillsDemo(cb: SkillsDemoCallbacks = {}): Promise<SkillsRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── Harness: SkillsMiddleware + load_skill progressive disclosure ───────
	const model = await getModel({ temperature: 0, maxTokens: 600 });
	const backend = new StateBackend();
	const agent = createDeepAgent({
		model,
		backend,
		skills: SKILLS,
		instructions: INSTRUCTIONS,
		tracer,
		maxIterations: 30
	});
	agent.subscribe((s) => cb.onFiles?.([...s.files]));

	const out = await agent.invoke({
		input: 'Write a single paragraph on stateful agent runtimes — and cite it properly.',
		thread: `skills-${Math.random().toString(36).slice(2, 6)}`
	});
	const last = out.messages[out.messages.length - 1];
	const text = displayContent(last?.content);
	return {
		events: localEvents,
		files: await backend.list(),
		finalText: text
	};
}
