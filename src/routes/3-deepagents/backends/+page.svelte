<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import {
		createDeepAgent,
		StateBackend,
		StoreBackend,
		CompositeBackend,
		type VirtualFile
	} from '$lib/deepagents';
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { browser } from '$app/environment';
	import { listFiles, clearScope } from '$lib/storage/dexie';
	import { onMount } from 'svelte';

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let storedAfterReload = $state<VirtualFile[]>([]);

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/scratch/draft.md',
							content: 'this is an ephemeral scratch note'
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/memories/preferences.md',
							content: '# User preferences\n- prefers short bullets\n- avoid emoji'
						}
					}
				]
			},
			{
				content: 'Wrote one scratch file (StateBackend) and one memory (StoreBackend).'
			}
		];
	}

	async function run() {
		busy = true;
		files = [];
		try {
			const composite = new CompositeBackend(
				[{ prefix: '/memories/', backend: new StoreBackend('lesson-backends') }],
				new StateBackend()
			);
			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const agent = createDeepAgent({
				model,
				backend: composite,
				instructions:
					'Use /scratch/ for transient notes and /memories/ for things the user should remember next session.'
			});
			agent.subscribe((s) => (files = [...s.files]));
			await agent.invoke({
				input: 'Save a scratch note and a memory about my preferences.',
				thread: 'backends-' + Math.random().toString(36).slice(2, 6)
			});
			files = await composite.list();
			await refreshSurvivors();
		} finally {
			busy = false;
		}
	}

	async function refreshSurvivors() {
		if (!browser) return;
		const recs = await listFiles('lesson-backends');
		storedAfterReload = recs.map((r) => ({
			path: r.path,
			content: r.content,
			backend: 'store'
		}));
	}

	async function clearStore() {
		if (!browser) return;
		await clearScope('lesson-backends');
		await refreshSurvivors();
	}

	onMount(() => {
		refreshSurvivors();
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

<Lesson title="Backends" eyebrow="Phase 3 · Lesson 04">
	{#snippet intro()}
		<p>
			Where files live is a pluggable choice. The harness ships three:
			<Term t="StateBackend" /> for ephemeral, thread-scoped notes;
			<Term t="StoreBackend" /> for durable, cross-thread memory; and
			<Term t="CompositeBackend" /> to route paths to either.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Three backends, one protocol">
			<p>
				All three implement the same <code>BackendProtocol</code> — <code>read</code>,
				<code>write</code>, <code>delete</code>, <code>list</code>. Any tool that touches
				files goes through the backend, which means the choice of where files live is purely
				configuration.
			</p>
			<CodeBlock code={code} caption="Routing /memories/ to a Dexie-backed store." />
		</Slide>

		<Slide title="Why composite is the default in practice">
			<p>
				Most real agents need both: scratch space that disappears on session end (so context
				stays clean) and a small, deliberate memory area that survives reloads (so the agent
				can build on past work). Composite gives you that with one declarative routing rule.
			</p>
		</Slide>

		<Slide title="Demo · two writes, one reload">
			<p>
				Run the agent. It writes one file under <code>/scratch/</code> (StateBackend) and one
				under <code>/memories/</code> (StoreBackend, IndexedDB). Reload this tab — only the
				memory survives. The "after reload" panel reads directly from IndexedDB to prove it.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Files written this run" subtitle="StateBackend + StoreBackend together">
			<FileTreeViewer files={files} />
		</Panel>

		<Panel title="Survives reload" subtitle="Read directly from IndexedDB">
			<FileTreeViewer files={storedAfterReload} />
			<div class="row">
				<button class="ghost" onclick={clearStore}>Clear store</button>
				<span class="hint">Reload the tab — these files persist.</span>
			</div>
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin-top: 0.6rem;
	}
	.ghost {
		font-size: 0.78rem;
		padding: 0.4rem 0.7rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border);
		border-radius: 0.35rem;
	}
	.ghost:hover {
		color: var(--color-fg);
	}
	.hint {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
	}
</style>
