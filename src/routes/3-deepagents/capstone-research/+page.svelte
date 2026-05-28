<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import TodoListView from '$lib/components/TodoListView.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import SubAgentTimeline from '$lib/components/SubAgentTimeline.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		StoreBackend,
		CompositeBackend,
		type SubAgentSpec,
		type Todo,
		type VirtualFile
	} from '$lib/deepagents';
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let topic = $state('Pregel and the bulk-synchronous parallel model');
	let busy = $state(false);
	let todos = $state<Todo[]>([]);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);

	const corpus: Record<string, string[]> = {
		pregel: [
			'Pregel paper (Malewicz 2010): vertex-centric BSP computation with synchronous supersteps.',
			'LangGraph runtime spec: each superstep merges concurrent updates via reducers.',
			'BSP analysis (Valiant 1990): predictable performance via synchronization barriers.'
		],
		default: [
			'A. Generic source 1 about the topic.',
			'B. Generic source 2 with a contradicting point.',
			'C. Generic source 3 with implementation details.'
		]
	};

	function pickCorpus(t: string) {
		const k = Object.keys(corpus).find((k) => t.toLowerCase().includes(k));
		return corpus[k ?? 'default'];
	}

	function makeResearcher(): SubAgentSpec {
		return {
			name: 'researcher',
			description: 'Find sources and extract key claims for a sub-question.',
			prompt: '...',
			run: async (input) => {
				await new Promise((r) => setTimeout(r, 500 + Math.random() * 600));
				const sources = pickCorpus(topic).slice(0, 2);
				return {
					summary: `For "${input.description}", found:\n${sources.map((s) => '- ' + s).join('\n')}`
				};
			}
		};
	}

	function makeWriter(): SubAgentSpec {
		return {
			name: 'writer',
			description: 'Synthesise notes into a 1-page brief.',
			prompt: '...',
			run: async (input) => {
				await new Promise((r) => setTimeout(r, 600));
				return {
					summary: `Drafted: "${input.description.slice(0, 60)}…" — 280 words, 3 sections, 6 citations.`
				};
			}
		};
	}

	function makeCritic(): SubAgentSpec {
		return {
			name: 'critic',
			description: 'Critique the brief for clarity, accuracy, and citations.',
			prompt: '...',
			run: async () => {
				await new Promise((r) => setTimeout(r, 350));
				return {
					summary: 'Critique: tighten paragraph 2, add an example, verify the citation in claim 3.'
				};
			}
		};
	}

	function script(): ScriptedResponse[] {
		const subQuestions = [
			`Origins and definition of ${topic}`,
			`Key abstractions in ${topic}`,
			`Limitations of ${topic}`
		];
		const todoState = (i: number, slot: 'in_progress' | 'completed'): Todo[] => {
			const all = [
				'Decompose the question',
				'Research sub-questions in parallel',
				'Draft the brief',
				'Critique the brief',
				'Save to /memories/'
			];
			return all.map((c, idx) => ({
				content: c,
				status: idx < i ? 'completed' : idx === i ? slot : 'pending'
			}));
		};
		return [
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: todoState(0, 'in_progress') } }] },
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/scratch/sub_questions.md',
							content: subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
						}
					}
				]
			},
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: todoState(1, 'in_progress') } }] },
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: { subagent: 'researcher', description: subQuestions[0] }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: { subagent: 'researcher', description: subQuestions[1] }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: { subagent: 'researcher', description: subQuestions[2] }
					}
				]
			},
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: todoState(2, 'in_progress') } }] },
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: {
							subagent: 'writer',
							description: `Write a 1-page brief on "${topic}", referencing the researcher findings.`
						}
					}
				]
			},
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: todoState(3, 'in_progress') } }] },
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: { subagent: 'critic', description: 'Critique the brief.' }
					}
				]
			},
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: todoState(4, 'in_progress') } }] },
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: `/memories/${topic.replace(/\s+/g, '-').toLowerCase()}.md`,
							content: `# ${topic}\n\nA 1-page brief synthesised from researcher, writer, and critic subagents.\n\n*This file lives in the StoreBackend and survives reloads.*`
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_todos',
						args: {
							todos: [
								'Decompose the question',
								'Research sub-questions in parallel',
								'Draft the brief',
								'Critique the brief',
								'Save to /memories/'
							].map((c) => ({ content: c, status: 'completed' as const }))
						}
					}
				]
			},
			{
				content: `Brief on "${topic}" saved to /memories/. The original sub-questions and intermediate notes live in /scratch/. Reload this tab — the saved brief survives.`
			}
		];
	}

	async function run() {
		busy = true;
		todos = [];
		files = [];
		events = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const backend = new CompositeBackend(
				[{ prefix: '/memories/', backend: new StoreBackend('research-capstone') }],
				new StateBackend()
			);
			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const agent = createDeepAgent({
				model,
				backend,
				subagents: [makeResearcher(), makeWriter(), makeCritic()],
				instructions:
					'You are a research lead. Always plan via write_todos. Decompose, delegate to researcher subagents in parallel, draft via writer, critique via critic, and save the final brief to /memories/.',
				tracer,
				maxIterations: 30
			});
			agent.subscribe((s) => {
				todos = [...s.todos];
				files = [...s.files];
			});
			await agent.invoke({
				input: `Brief me on ${topic}.`,
				thread: 'capstone-' + Math.random().toString(36).slice(2, 6)
			});
		} finally {
			busy = false;
		}
	}
</script>

<Lesson title="Capstone — Deep Research" eyebrow="Phase 3 · Capstone 1">
	{#snippet intro()}
		<p>
			Everything you've seen comes together: <Term t="write_todos" /> for planning, parallel
			researcher subagents for context isolation, a <Term t="CompositeBackend" /> that routes
			the final report to durable memory, and a virtual filesystem so intermediate notes don't
			pollute the conversation.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The architecture">
			<p>
				One parent agent orchestrates the run. It plans, fans out to three researchers (one
				per sub-question), waits for their summaries, hands them to a writer subagent, then
				to a critic. Final output goes to <code>/memories/{'{topic}'}.md</code>, which lives
				in IndexedDB and survives reloads.
			</p>
		</Slide>

		<Slide title="What to watch">
			<ul>
				<li>The <strong>plan</strong> evolving in real time as steps complete.</li>
				<li>The <strong>subagent timeline</strong> showing parallel research spans.</li>
				<li>
					The <strong>filesystem</strong> filling with <code>/scratch/sub_questions.md</code>,
					then a <code>/memories/{'<topic>'}.md</code> tagged with the StoreBackend.
				</li>
				<li>
					After the run, <em>reload this tab</em>. Only the file under <code>/memories/</code>
					comes back.
				</li>
			</ul>
		</Slide>

		<Slide title="Why the parent stays small">
			<p>
				The parent never sees the researcher's full debate, the writer's draft revisions, or
				the critic's deliberations — only the one-line summaries each returns. This is the
				core <Term t="Context quarantine">context quarantine</Term> idea, and it is what
				makes 30-step runs feel as crisp as 3-step ones.
			</p>
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
			<TodoListView todos={todos} />
		</Panel>

		<Panel title="Subagent timeline">
			<SubAgentTimeline events={events} />
		</Panel>

		<Panel title="Workspace">
			<FileTreeViewer files={files} />
		</Panel>

		<Panel title="Trace">
			<TraceLog events={events} />
		</Panel>
	{/snippet}
</Lesson>

<style>
	input {
		width: 100%;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.actions {
		margin-top: 0.6rem;
	}
</style>
