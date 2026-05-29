<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import TodoListView from '$lib/components/TodoListView.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import SubagentCard from '$lib/components/SubagentCard.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
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
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { HumanMessage, SystemMessage } from '@langchain/core/messages';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface RunPayload {
		topic: string;
		todos: Todo[];
		files: VirtualFile[];
		events: TraceEvent[];
		reports: SubAgentReport[];
		finalText: string;
	}

	let topic = $state('Pregel and the bulk-synchronous parallel model');
	let busy = $state(false);
	let todos = $state<Todo[]>([]);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let reports = $state<SubAgentReport[]>([]);
	let finalText = $state<string>('');

	// The agent saves its brief somewhere under /memories/; match whatever .md it wrote
	// (LLMs don't always reproduce the exact filename) so the rendered brief always shows.
	const memoryFile = $derived(
		files.find((f) => f.path.startsWith('/memories/') && /\.md$/i.test(f.path)) ??
			files.find((f) => f.path === `/memories/${slugify(topic)}.md`)
	);
	const memoryPath = $derived(memoryFile?.path ?? null);

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

	async function run() {
		busy = true;
		todos = [];
		files = [];
		events = [];
		reports = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: `l3-capstone-research-${slugify(topic)}` },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const backend = new CompositeBackend(
						[
							{
								prefix: '/memories/',
								backend: new StoreBackend('research-capstone')
							}
						],
						new StateBackend()
					);
					const model = await getModel({ temperature: 0.1, maxTokens: 800 });
					const agent = createDeepAgent({
						model,
						backend,
						subagents: [
							makeSubagent('researcher'),
							makeSubagent('writer'),
							makeSubagent('critic')
						],
						instructions: instructionsFor(topic),
						tracer,
						maxIterations: 40
					});
					agent.subscribe((s) => {
						todos = [...s.todos];
						files = [...s.files];
						reports = [...s.subagentReports];
					});

					const out = await agent.invoke({
						input: `Brief me on ${topic}.`,
						thread: `capstone-${Math.random().toString(36).slice(2, 6)}`
					});
					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');
					return {
						topic,
						todos: out.todos,
						files: await backend.list(),
						events: localEvents,
						reports: out.subagentReports,
						finalText: text
					};
				}
			);
			todos = result.todos;
			files = result.files;
			events = result.events;
			reports = result.reports;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	function slugify(t: string) {
		return t
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.slice(0, 60);
	}

	$effect(() => {
		const t = topic;
		(async () => {
			const cached = await loadCachedRun<RunPayload>({
				demoId: `l3-capstone-research-${slugify(t)}`
			});
			if (cached && cached.payload.topic === t) {
				todos = cached.payload.todos;
				files = cached.payload.files;
				events = cached.payload.events;
				reports = cached.payload.reports ?? [];
				finalText = cached.payload.finalText;
			} else {
				todos = [];
				files = [];
				events = [];
				reports = [];
				finalText = '';
			}
		})();
	});
</script>

<Lesson
	title="Capstone — Deep Research"
	eyebrow="Phase 3 · Capstone 1"
	motivation="A capstone is where the parts compose. Plan, delegate, summarise, publish — the same loop a senior researcher would run, expressed in code."
	hero={{
		id: 'l3-capstone-research',
		alt: "A grand reading room with three subagents sending findings via pneumatic tubes to an editor's desk"
	}}
>
	{#snippet intro()}
		<p>
			Everything you've seen comes together: <Term t="write_todos" /> for planning, parallel
			researcher subagents for context isolation, a <Term t="CompositeBackend" /> that routes
			the final report to durable memory, and a virtual filesystem so intermediate notes
			don't pollute the conversation.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="A team, expressed in tools" variant="dropcap">
			<p>
				The first chapters built the primitives; this one shows them composed into the
				smallest shape that earns the name "research agent". One parent agent owns the plan
				and the publish step. Three subagents — researcher, writer, critic — each take a
				slice of the cognitive load with their own context window, their own prompt, and
				their own one-line report back. The parent never sees the debate.
			</p>
			<p>
				This is the loop a senior researcher actually runs: scope the question, hand the
				slices to specialists, draft, review, archive the final under a stable name. The
				difference is that here it is declarative — the same six tools, the same backends,
				the same planner — composed by a real model in real time.
			</p>
		</Slide>

		<Slide title="The architecture">
			<p>
				One parent agent orchestrates the run. It plans, fans out to three researchers (one
				per sub-question), waits for their summaries, hands them to a writer subagent, then
				to a critic. Final output goes to <code>/memories/{'<topic>'}.md</code>, which
				lives in IndexedDB and survives reloads.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The interesting thing about the capstone is not what each piece does. It is that
				the same six tools and three backends could be re-composed into a code review
				agent, an operations agent, an analyst agent — without changing the harness.
			</p>
		</Slide>

		<Slide title="What to watch">
			<ul>
				<li>The <strong>plan</strong> evolving in real time as steps complete.</li>
				<li>The <strong>subagent timeline</strong> showing each delegation as a span.</li>
				<li>
					The <strong>filesystem</strong> filling with <code>/scratch/sub_questions.md</code>,
					then a <code>/memories/{'<topic>'}.md</code> tagged with the StoreBackend.
				</li>
				<li>
					After the run, <em>reload this tab</em>. Only the file under
					<code>/memories/</code> comes back.
				</li>
			</ul>
		</Slide>

		<Slide title="Why the parent stays small">
			<p>
				The parent never sees the researcher's full debate, the writer's draft revisions,
				or the critic's deliberations — only the one-line summaries each returns. This is
				the core context-quarantine idea, and it is what makes 30-step runs feel as crisp
				as 3-step ones.
			</p>
		</Slide>

		<Slide ornament>
			<p>· plan · delegate · summarise · publish ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Topic">
			<input type="text" bind:value={topic} />
			<div class="actions">
				<RunButton onclick={run} running={busy} label="Run capstone" />
			</div>
		</Panel>

		<Panel title="Plan">
			<TodoListView {todos} />
		</Panel>

		<Panel title="Subagents">
			{#if reports.length === 0}
				<p class="finaltext"><em>No subagent reports yet — run the capstone.</em></p>
			{:else}
				<div class="cards">
					{#each reports as r, i (i)}
						<SubagentCard
							name={r.name}
							status="done"
							report={r.summary}
							durationMs={r.durationMs}
						/>
					{/each}
				</div>
			{/if}
		</Panel>

		<Panel title="Workspace">
			<FileTreeViewer {files} focus={memoryPath} />
		</Panel>

		{#if memoryFile}
			<Panel title="Published brief">
				<div class="brief">
					<Markdown source={memoryFile.content} />
				</div>
			</Panel>
		{:else if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	input {
		width: 100%;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-sans);
		font-size: 0.92rem;
		color: var(--color-ink-100);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-ink);
	}
	.actions {
		margin-top: 0.65rem;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.brief {
		max-height: 26rem;
		overflow-y: auto;
		padding-right: 0.5rem;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
