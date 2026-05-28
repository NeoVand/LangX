<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		StoreBackend,
		CompositeBackend,
		type VirtualFile
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import { browser } from '$app/environment';
	import { listFiles, clearScope } from '$lib/storage/dexie';

	interface RunPayload {
		files: VirtualFile[];
		events: TraceEvent[];
		finalText: string;
	}

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state<string>('');
	let storedAfterReload = $state<VirtualFile[]>([]);

	const SCOPE = 'lesson-backends';

	const INSTRUCTIONS = `You are a memory steward. Use the virtual filesystem with this routing rule:
- /scratch/ — ephemeral notes for this run only.
- /memories/ — durable notes the user will want available next session.

For the user's request, you must:
1. Write a SHORT scratch note at /scratch/draft.md describing the rough idea.
2. Write a focused memory at /memories/preferences.md capturing the user's stated preferences
   as a small bulleted markdown document.

Use only write_file. End with one summary sentence. Do not chat between tool calls.`;

	async function run() {
		busy = true;
		files = [];
		events = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-backends-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const composite = new CompositeBackend(
						[{ prefix: '/memories/', backend: new StoreBackend(SCOPE) }],
						new StateBackend()
					);
					const model = await getModel({ temperature: 0, maxTokens: 600 });
					const agent = createDeepAgent({
						model,
						backend: composite,
						instructions: INSTRUCTIONS,
						tracer,
						maxIterations: 10
					});
					agent.subscribe((s) => (files = [...s.files]));

					const out = await agent.invoke({
						input: `I prefer short, terse bullets. I dislike emoji. I want responses to be
direct. Save a scratch note about today's planning and capture my preferences in /memories/.`,
						thread: `backends-${Math.random().toString(36).slice(2, 6)}`
					});

					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');
					const finalFiles = await composite.list();
					return { files: finalFiles, events: localEvents, finalText: text };
				}
			);
			files = result.files;
			events = result.events;
			finalText = result.finalText;
			await refreshSurvivors();
		} finally {
			busy = false;
		}
	}

	async function refreshSurvivors() {
		if (!browser) return;
		const recs = await listFiles(SCOPE);
		storedAfterReload = recs.map((r) => ({
			path: r.path,
			content: r.content,
			backend: 'store'
		}));
	}

	async function clearStore() {
		if (!browser) return;
		await clearScope(SCOPE);
		await refreshSurvivors();
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-backends-run' });
			if (cached) {
				files = cached.payload.files;
				events = cached.payload.events;
				finalText = cached.payload.finalText;
			}
			await refreshSurvivors();
		})();
	});

	const code = `import { createDeepAgent, StateBackend, StoreBackend, CompositeBackend } from '$lib/deepagents';

const backend = new CompositeBackend(
  // /memories/ → durable, survives reloads (Dexie/IndexedDB).
  [{ prefix: '/memories/', backend: new StoreBackend('my-app') }],
  // Everything else → in-memory state, scoped to this thread.
  new StateBackend()
);

const agent = createDeepAgent({ model, backend });`;
</script>

<Lesson
	title="Backends"
	eyebrow="Phase 3 · Lesson 04"
	motivation="Some files vanish at the end of the run; some persist forever; some live somewhere in between. The backend tells the harness which is which."
	hero={{
		id: 'l3-backends',
		alt: "Two-room cutaway: a chalkboard 'State' and a stone vault 'Store'"
	}}
>
	{#snippet intro()}
		<p>
			Where files live is a pluggable choice. The harness ships three:
			<Term t="StateBackend" /> for ephemeral, thread-scoped notes;
			<Term t="StoreBackend" /> for durable, cross-thread memory; and
			<Term t="CompositeBackend" /> to route paths to either.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="One protocol, three lifetimes" variant="dropcap">
			<p>
				A code agent and a memory agent live in the same harness but have completely
				different ideas about persistence. A scratch buffer that survives the run is a
				distraction; a memory that does not survive the run is broken. The backend protocol
				lets the same six filesystem tools talk to either store, with the choice expressed
				as routing rules rather than special cases scattered through the agent.
			</p>
			<p>
				The default in practice is composite: a hot, ephemeral scratch space for the current
				task and a small, deliberate memory area for things the next session will want to
				see. Two lifetimes; one protocol; one mental model.
			</p>
		</Slide>

		<Slide title="Three backends, one protocol" variant="code-first">
			<p>
				All three implement the same <code>BackendProtocol</code> — <code>read</code>,
				<code>write</code>, <code>delete</code>, <code>list</code>. Any tool that touches
				files goes through the backend, so where the files live becomes pure configuration.
			</p>
			<CodeBlock code={code} lang="ts" caption="Routing /memories/ to a Dexie-backed store." />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				Composite is the only configuration that maps cleanly to how humans think about
				their own notes — a scratch pile for now, a small filing cabinet for later.
			</p>
		</Slide>

		<Slide title="Demo · two writes, one reload">
			<p>
				The agent receives a brief and writes one note under <code>/scratch/</code>
				(StateBackend) and one under <code>/memories/</code> (StoreBackend, IndexedDB).
				Reload this tab — only the memory survives. The "after reload" panel reads directly
				from IndexedDB to prove it.
			</p>
		</Slide>

		<Slide ornament>
			<p>· chalk · vault · ledger ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Files written this run" subtitle="StateBackend + StoreBackend together">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Survives reload" subtitle="read directly from IndexedDB">
			<FileTreeViewer files={storedAfterReload} />
			<div class="row">
				<button class="ghost" onclick={clearStore}>Clear store</button>
				<span class="hint">Reload the tab — these files persist.</span>
			</div>
		</Panel>

		<Panel title="Trace">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		margin-top: 0.65rem;
	}
	.ghost {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.4rem 0.7rem;
		background: var(--color-bg);
		color: var(--color-ink-200);
		border: 1px solid var(--color-rule);
		border-radius: 0.35rem;
	}
	.ghost:hover {
		color: var(--color-ink-100);
		border-color: var(--accent-ink);
	}
	.hint {
		font-family: var(--font-prose);
		font-size: 0.85rem;
		color: var(--color-ink-300);
		font-style: italic;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
