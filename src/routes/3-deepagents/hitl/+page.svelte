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
		type VirtualFile
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface RunPayload {
		events: TraceEvent[];
		files: VirtualFile[];
		errorMessage: string | null;
	}

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let errorMessage = $state<string | null>(null);

	const INSTRUCTIONS = `You are about to write two files. Call write_file twice in order:
1. write_file('/draft.md',     '# First draft')
2. write_file('/published.md', '# Published\\n\\nReady for the team.')

Then reply with one short summary sentence. Do not chat between tool calls.`;

	async function run() {
		busy = true;
		files = [];
		events = [];
		errorMessage = null;
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-hitl-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const model = await getModel({ temperature: 0, maxTokens: 400 });
					const backend = new StateBackend();
					const agent = createDeepAgent({
						model,
						backend,
						interruptOn: ['write_file'],
						instructions: INSTRUCTIONS,
						tracer,
						maxIterations: 8
					});
					agent.subscribe((s) => (files = [...s.files]));

					let err: string | null = null;
					try {
						await agent.invoke({
							input: 'Write the draft and the published file.',
							thread: `hitl-${Math.random().toString(36).slice(2, 6)}`
						});
					} catch (e) {
						err = e instanceof Error ? e.message : String(e);
					}
					return {
						events: localEvents,
						files: await backend.list(),
						errorMessage: err
					};
				}
			);
			events = result.events;
			files = result.files;
			errorMessage = result.errorMessage;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-hitl-run' });
			if (cached) {
				events = cached.payload.events;
				files = cached.payload.files;
				errorMessage = cached.payload.errorMessage;
			}
		})();
	});

	const code = `createDeepAgent({
  model,
  interruptOn: ['write_file', 'send_email', 'shell']
});

// On the host side:
let out = await agent.invoke({ input });
while (out.__interrupt__) {
  const { tool, args } = out.__interrupt__[0].value;
  const decision = await askHuman(tool, args);
  out = await agent.invoke(new Command({ resume: { decision } }));
}`;
</script>

<Lesson
	title="Human-in-the-loop"
	eyebrow="Phase 3 · Lesson 09"
	motivation="Some decisions need a human stamp. interruptOn turns 'pause and ask' from glue code into a property of the harness."
	hero={{
		id: 'l3-hitl',
		alt: "A judge's bench: a small mechanical agent awaits an approve/deny stamp"
	}}
>
	{#snippet intro()}
		<p>
			<code>interruptOn: ['write_file']</code> is enough to put any tool behind a
			<Term t="HITL" /> gate. The harness pauses the graph at the named tool, surfaces the
			proposed call to the host, and resumes only on a Command. Built directly on Phase 2's
			interrupt primitive.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="The smallest production-safe pause" variant="dropcap">
			<p>
				Some tools cannot be entrusted to a model alone — sending email, calling a mutating
				API, deleting files, running a shell. The right primitive is not a longer prompt
				asking nicely; it is a pause. The harness's <code>interruptOn</code> turns any
				named tool into one that halts the graph and surfaces a request for human approval,
				with the proposed arguments visible.
			</p>
			<p>
				The cost is one human click per dangerous action. The upside is that no
				mis-decision survives review. And because the pause is a property of the harness
				rather than glue code per tool, the same approval card works for every tool you
				ever gate.
			</p>
		</Slide>

		<Slide title="What gets surfaced" variant="code-first">
			<p>
				When the agent calls a guarded tool, the harness throws an interrupt with the tool
				name, its arguments, and the call ID. The host shows this to a human and resumes
				with <code>Command(&#123; resume: &#123; decision &#125; &#125;)</code>.
			</p>
			<CodeBlock code={code} lang="ts" caption="The host loop for an interrupting harness." />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				Trust is a UX problem before it is a model problem. <code>interruptOn</code> is the
				clearest way the harness makes that UX a one-liner.
			</p>
		</Slide>

		<Slide title="A note on this demo">
			<p>
				LangX is a static lesson environment, so this page wires the harness but does not
				render an interactive resume UI. The trace shows that the harness <em>raised</em>
				an interrupt for the first <code>write_file</code> — that is the contract a
				production host implements against. In a live deployment the host would show the
				email-approval card from Phase 2's HITL lesson and call <code>invoke</code> again
				with a Command to resume.
			</p>
		</Slide>

		<Slide title="Why this is the safe default">
			<p>
				For destructive tools, never trust the model alone. Wrap them. The cost is one
				human click per dangerous action; the upside is no surprises — and the same gate
				works for every tool you ever guard, because the harness handles the plumbing.
			</p>
		</Slide>

		<Slide ornament>
			<p>· propose · pause · approve ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Try two write_file calls" />
		</Panel>

		<Panel title="Filesystem (no writes commit while paused)">
			<FileTreeViewer {files} />
		</Panel>

		{#if errorMessage}
			<Panel title="Harness pause" subtitle="GraphInterrupt — the host would resume here">
				<p class="pause">{errorMessage}</p>
			</Panel>
		{/if}

		<Panel title="Trace (look for 'pause for write_file')">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.pause {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		padding: 0.7rem 0.85rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		white-space: pre-wrap;
	}
</style>
