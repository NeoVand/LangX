<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { backends } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { type VirtualFile } from '$lib/deepagents';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import { browser } from '$app/environment';
	import { listFiles, clearScope } from '$lib/storage/dexie';
	import { runBackendsDemo, BACKENDS_SCOPE, type BackendsRunResult } from '$lib/demos/da-backends';
	import backendsSrc from '$lib/demos/da-backends.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-backends',
		title: 'Backends',
		summary:
			'A memory steward writing through a CompositeBackend that routes /memories/ to durable storage.',
		entries: [{ path: 'lib/demos/da-backends.ts', code: backendsSrc }],
		runner: `import { runBackendsDemo } from './lib/demos/da-backends';

const { files, finalText } = await runBackendsDemo({
	onFiles: (live) => console.log('  · files:', live.map((f) => f.path).join(', '))
});

console.log('\\nFiles written this run:');
for (const f of files) console.log('  [' + (f.backend ?? 'state') + ']', f.path);
console.log('\\nSummary:', finalText);
`
	};

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state<string>('');
	let storedAfterReload = $state<VirtualFile[]>([]);

	const SCOPE = BACKENDS_SCOPE;

	async function run() {
		busy = true;
		files = [];
		events = [];
		finalText = '';
		try {
			const result = await withRunCache<BackendsRunResult>(
				{ demoId: 'l3-backends-run' },
				async () =>
					runBackendsDemo({
						onFiles: (f) => (files = f),
						onTrace: (e) => (events = e)
					})
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
			const cached = await loadCachedRun<BackendsRunResult>({ demoId: 'l3-backends-run' });
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
	eyebrow="Level 3 · Lesson 04"
	hero={{
		id: 'l3-backends',
		alt: "Two-room cutaway: a chalkboard 'State' and a stone vault 'Store'"
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Some files vanish at the end of the run; some persist forever; some live somewhere in between. The <Term t="Backend">backend</Term> tells the <Term t="Harness">harness</Term> which is which.
	{/snippet}

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
				A code agent and a memory agent live in the same <Term t="Harness">harness</Term> but have completely
				different ideas about persistence. A scratch buffer that survives the run is a
				distraction; a memory that does not survive the run is broken. The <Term t="BackendProtocol"><code>BackendProtocol</code></Term>
				lets the same six <Term t="Virtual filesystem">filesystem</Term> tools talk to either store, with the choice expressed
				as routing rules rather than special cases scattered through the agent.
			</p>
			<p>
				The default in practice is <Term t="CompositeBackend">composite</Term>: <Term t="StateBackend">StateBackend</Term> for hot, ephemeral scratch and <Term t="StoreBackend">StoreBackend</Term> for a small, deliberate <Term t="Store">memory</Term> area the next session will want to
				see. Two lifetimes; one protocol; one mental model.
			</p>
		</Slide>

		<Slide title="Three backends, one protocol" variant="code-first">
			<p>
				All three implement the same <Term t="BackendProtocol"><code>BackendProtocol</code></Term> — <code>read</code>,
				<code>write</code>, <code>delete</code>, <code>list</code>. Any <Term t="tool">tool</Term> that touches
				files goes through the <Term t="Backend">backend</Term>, so where the files live becomes pure configuration.
			</p>
			<CodeBlock code={code} lang="ts" caption="Routing /memories/ to a Dexie-backed store." />
		</Slide>

		<Diagram spec={backends} />

		<Slide variant="pull-quote">
			<p>
				Composite is the only configuration that maps cleanly to how humans think about
				their own notes — a scratch pile for now, a small filing cabinet for later.
			</p>
		</Slide>

		<Slide title="Demo · two writes, one reload">
			<p>
				The agent receives a brief and writes one note under <code>/scratch/</code>
				(<Term t="StateBackend">StateBackend</Term>) and one under <code>/memories/</code> (<Term t="StoreBackend">StoreBackend</Term>, <Term t="IndexedDB">IndexedDB</Term> via <Term t="Dexie">Dexie</Term>).
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
