<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import type { VirtualFile } from '$lib/deepagents';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		runPermissionsDemo,
		permissions,
		type PermissionsRunResult
	} from '$lib/demos/da-permissions';
	import daPermissionsSrc from '$lib/demos/da-permissions.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-permissions',
		title: 'Filesystem permissions',
		summary:
			'First-match-wins permission rules: the agent attempts five writes; two land, three are denied.',
		entries: [{ path: 'lib/demos/da-permissions.ts', code: daPermissionsSrc }],
		runner: `import { runPermissionsDemo } from './lib/demos/da-permissions';

const out = await runPermissionsDemo({
	onTrace: (events) => {
		const last = events[events.length - 1];
		if (last && (last.kind === 'fs_op' || last.kind === 'error'))
			console.log('  ·', last.kind, '—', last.label);
	}
});

console.log('\\nFiles that survived:', out.files.map((f) => f.path).join(', '));
console.log('Final:', out.finalText);
`
	};

	type RunPayload = PermissionsRunResult;

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state<string>('');

	async function run() {
		busy = true;
		files = [];
		events = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-permissions-run' },
				async () =>
					await runPermissionsDemo({
						onTrace: (ev) => (events = ev),
						onFiles: (f) => (files = f)
					})
			);
			files = result.files;
			events = result.events;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-permissions-run' });
			if (cached) {
				files = cached.payload.files;
				events = cached.payload.events;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const code = `const permissions = [
  // Most specific first. First match wins.
  { operations: ['write'], paths: ['**/.env', 'secrets/**'],     mode: 'deny'  },
  { operations: ['read', 'write'], paths: ['src/**', 'docs/**'], mode: 'allow' },
  // Default catch-all: deny everything else.
  { operations: ['read', 'write'], paths: ['**'],                mode: 'deny'  }
];`;
</script>

<Lesson
	title="Filesystem permissions"
	eyebrow="Level 3 · Lesson 05"
	hero={{
		id: 'l3-permissions',
		alt: 'Ornate doors with unique glyphs and tiny padlocks set into a stone wall'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		An agent that can <Term t="write_file"><code>write_file</code></Term> to your filesystem is a feature; one that can write to <code>/etc</code> is a CVE. <Term t="Permissions">Permissions</Term> are the smallest, sharpest tool for that distinction.
	{/snippet}

	{#snippet intro()}
		<p>
			<Term t="Permissions">Permissions</Term> are declarative: a list of <code>{'{ operations, paths, mode }'}</code>
			rules evaluated <Term t="first-match-wins">first-match-wins</Term>. Order matters — put deny rules at the top, then
			specific allows, and end with a catch-all.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Prompts ask; rules enforce" variant="dropcap">
			<p>
				Telling a model "do not write to <code>.env</code>" works some of the time.
				Code-level enforcement works every time. The <Term t="Harness">harness</Term> layers them in the right order:
				the <Term t="System prompt">prompt</Term> explains intent, the <Term t="Permissions">permission</Term> list is the ground truth, and the agent
				gets a clear error message when it crosses a line — so it can adapt instead of
				silently failing.
			</p>
			<p>
				Concretely, every <Term t="read_file">read</Term> or <Term t="write_file">write</Term> is evaluated against the rule list before it
				executes. <Term t="first-match-wins">First-match-wins</Term>. Specific deny rules pin the dangerous
				ground; specific allows open the rest; a final catch-all deny is the safety net.
			</p>
		</Slide>

		<Slide title="The shape" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="The exact rules used in this demo." />
			<p>
				A failed check throws, and the model sees the error message in the next
				<Term t="ToolMessage">ToolMessage</Term> — so it knows what was blocked and can adapt.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The smallest production-safe agent is one whose dangerous moves are described in
				config, not in a paragraph of polite instructions.
			</p>
		</Slide>

		<Slide title="Watch the trace">
			<p>
				The agent attempts five writes. Two succeed (<code>src/util.ts</code>,
				<code>docs/intro.md</code>); three are blocked (<code>secrets/keys.txt</code>,
				<code>.env</code>, <code>random.md</code>). The trace logs both successful filesystem
				operations and the permission-denied errors, with the matched rule.
			</p>
		</Slide>

		<Slide ornament>
			<p>· allow · deny · audit ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Active permissions" subtitle="first match wins">
			<ol class="rules">
				{#each permissions as p, i (i)}
					<li data-mode={p.mode}>
						<code>{p.mode.toUpperCase()}</code>
						<span class="ops">{p.operations.join(', ')}</span>
						<span class="paths">{p.paths.join(' · ')}</span>
					</li>
				{/each}
			</ol>
			<RunButton onclick={run} running={busy} label="Try 5 writes" />
		</Panel>

		<Panel title="Files that survived">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace (errors → permission denials)">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.rules {
		list-style: none;
		padding: 0;
		margin: 0 0 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.rules li {
		display: grid;
		grid-template-columns: 5rem 7rem 1fr;
		gap: 0.55rem;
		align-items: center;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.rules li[data-mode='deny'] code {
		color: var(--color-accent-danger);
	}
	.rules li[data-mode='allow'] code {
		color: var(--color-accent-success);
	}
	.ops {
		color: var(--color-ink-300);
	}
	.paths {
		color: var(--color-ink-100);
		word-break: break-all;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
