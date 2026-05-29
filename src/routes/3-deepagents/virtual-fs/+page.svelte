<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import Diff from '$lib/components/Diff.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { type VirtualFile } from '$lib/deepagents';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		runVirtualFsDemo,
		type FsRunResult,
		type FileEdit,
		type FsScenario as Scenario
	} from '$lib/demos/da-virtual-fs';
	import virtualFsSrc from '$lib/demos/da-virtual-fs.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-virtual-fs',
		title: 'The virtual filesystem',
		summary:
			'An agent working files through the six-tool filesystem API — write, edit surgically, verify.',
		entries: [{ path: 'lib/demos/da-virtual-fs.ts', code: virtualFsSrc }],
		runner: `import { runVirtualFsDemo } from './lib/demos/da-virtual-fs';

const { files, edits, finalText } = await runVirtualFsDemo('edit', {
	onFiles: (live) => console.log('  · files:', live.map((f) => f.path).join(', '))
});

console.log('\\nFinal filesystem:');
for (const f of files) console.log('  -', f.path);
for (const e of edits) console.log('\\nedit ' + e.path + ':\\n  before: ' + e.before + '\\n  after:  ' + e.after);
console.log('\\nSummary:', finalText);
`
	};

	let scenario = $state<Scenario>('organize');
	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state<string>('');
	let edits = $state<FileEdit[]>([]);

	async function run() {
		busy = true;
		files = [];
		events = [];
		finalText = '';
		edits = [];
		try {
			const which = scenario;
			const result = await withRunCache<FsRunResult>(
				{ demoId: `l3-virtual-fs-${which}` },
				async () =>
					runVirtualFsDemo(which, {
						onFiles: (f) => (files = f),
						onTrace: (e) => (events = e),
						onEdits: (ed) => (edits = ed)
					})
			);
			files = result.files;
			events = result.events;
			finalText = result.finalText;
			edits = result.edits ?? [];
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		const which = scenario;
		(async () => {
			const cached = await loadCachedRun<FsRunResult>({
				demoId: `l3-virtual-fs-${which}`
			});
			if (cached && cached.payload.scenario === which) {
				files = cached.payload.files;
				events = cached.payload.events;
				finalText = cached.payload.finalText;
				edits = cached.payload.edits ?? [];
			} else {
				files = [];
				events = [];
				finalText = '';
				edits = [];
			}
		})();
	});

	const surfaceCode = `// All six tools share one BackendProtocol.
//   ls()                                      → list files
//   read_file(path, offset?, limit?)          → read up to {limit} lines
//   write_file(path, content)                 → create or overwrite
//   edit_file(path, oldString, newString)     → unique-replace surgery
//   glob(pattern)                             → "src/**/*.ts" style search
//   grep(pattern, ignoreCase?)                → regex over file contents`;

	const editCode = `// edit_file is intentionally narrow:
//   - oldString MUST be unique in the file (or pass replaceAll: true).
//   - If oldString is not found, the tool returns an error the model can read.
//   - The model adapts; the file is never silently corrupted.
//
// This trade-off — expressiveness for safety — is what makes long-running
// editing agents trustworthy without a diffing harness on top.`;
</script>

<Lesson
	title="Virtual filesystem"
	eyebrow="Phase 3 · Lesson 02"
	motivation="Conversation is bandwidth-limited. The virtual filesystem is how an agent thinks long-form — pin the artifact, edit it, share it with subagents, and never relitigate it in chat."
	hero={{
		id: 'l3-virtual-fs',
		alt: 'A wall of small wooden file drawers with abstract glyph labels'
	}}
	source={demoSource}
>
	{#snippet intro()}
		<p>
			The harness gives the agent a six-tool API for working with files. There is no real
			disk — files live in graph state (or a <Term t="Store" />) — but the model thinks like a
			coder, and that mental model is what unlocks long-horizon work.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Files are slower-burning context" variant="dropcap">
			<p>
				Long outputs do not belong in the conversation. Past a couple hundred tokens, every
				re-render of an artifact is wasted budget — the model paraphrases its own work and the
				signal drifts. A virtual filesystem turns "render in chat" into "write to a path,
				reference by name," and the same artifact survives planning, delegation, and
				compaction without being rewritten.
			</p>
			<p>
				The result is an agent that can sustain a multi-step project across dozens of turns:
				it pins what it has produced, edits it surgically, and asks subagents to extend it —
				rather than re-narrating the entire body of work every round.
			</p>
		</Slide>

		<Slide title="Six tools is enough" variant="code-first">
			<CodeBlock code={surfaceCode} lang="ts" caption="The full filesystem surface." />
			<p>
				Six tools cover the whole working set a code agent ever asked for: enumerate the
				workspace, read a slice, write or overwrite, edit precisely, find by glob, search by
				regex. Everything else is a composition of these.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A file is the smallest unit of context that an agent can pin, share, and edit without
				retyping it. Six tools is the smallest API that makes a file usable as a tool of thought.
			</p>
		</Slide>

		<Slide title="edit_file is surgical" variant="code-first">
			<CodeBlock code={editCode} lang="ts" />
			<p>
				The agent cannot accidentally clobber an unrelated occurrence. When the unique-match
				assumption fails, it sees a tool error and revises — the same loop you would use as a
				human, made explicit.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1 takes a free-form dump and spreads it across <code>/notes/*.md</code>. Demo 2
				writes a tiny utility, edits one line, and re-reads it to verify. The right pane
				shows the live filesystem and every tool call as it happens.
			</p>
		</Slide>

		<Slide ornament>
			<p>· vault · drawer · key ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Pick a scenario">
			<div class="modes">
				<label class:selected={scenario === 'organize'}>
					<input type="radio" bind:group={scenario} value="organize" />
					<span>Organize notes</span>
					<small>Spread a raw dump across /notes/.</small>
				</label>
				<label class:selected={scenario === 'edit'}>
					<input type="radio" bind:group={scenario} value="edit" />
					<span>Edit code</span>
					<small>Write, edit precisely, verify.</small>
				</label>
			</div>
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Filesystem (live)" subtitle="files written by the agent">
			<FileTreeViewer {files} />
		</Panel>

		{#if edits.length}
			<Panel title="edit_file diff" subtitle="before → after, like git diff">
				<div class="diffs">
					{#each edits as edit (edit.path)}
						<Diff path={edit.path} before={edit.before} after={edit.after} />
					{/each}
				</div>
			</Panel>
		{/if}

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace" subtitle="every tool call as it happened">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
		margin-bottom: 0.85rem;
	}
	.modes label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		background: var(--color-bg);
		cursor: pointer;
	}
	.modes label.selected {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 0.92rem;
		color: var(--color-ink-100);
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-prose);
	}
	.diffs {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
