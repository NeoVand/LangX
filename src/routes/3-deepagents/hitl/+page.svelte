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
		type CompiledDeepAgent,
		type HarnessInterrupt,
		type VirtualFile
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { displayContent } from '$lib/runtime/messages';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let pending = $state<HarnessInterrupt | null>(null);
	let editArgs = $state('');
	let finalText = $state('');
	let agent: CompiledDeepAgent | null = null;
	let thread = '';
	let log = $state<{ tool: string; decision: string }[]>([]);

	const INSTRUCTIONS = `You are about to write two files. Call write_file twice in order:
1. write_file('/draft.md',     '# First draft')
2. write_file('/published.md', '# Published\\n\\nReady for the team.')

Then reply with one short summary sentence. Do not chat between tool calls.`;

	function presentInterrupt(i: HarnessInterrupt) {
		pending = i;
		editArgs = JSON.stringify(i.args, null, 2);
	}

	async function run() {
		busy = true;
		files = [];
		events = [];
		pending = null;
		finalText = '';
		log = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const model = await getModel({ temperature: 0, maxTokens: 400 });
			const backend = new StateBackend();
			thread = `hitl-${Math.random().toString(36).slice(2, 6)}`;
			agent = createDeepAgent({
				model,
				backend,
				interruptOn: ['write_file'],
				instructions: INSTRUCTIONS,
				tracer,
				maxIterations: 8
			});
			agent.subscribe((s) => (files = [...s.files]));

			const res = await agent.start({ input: 'Write the draft and the published file.', thread });
			if (res.status === 'interrupted') presentInterrupt(res.interrupt);
			else finishFrom(res.state);
		} finally {
			busy = false;
		}
	}

	function finishFrom(state: { messages?: unknown[] }) {
		const msgs = (state.messages ?? []) as { content?: unknown }[];
		finalText = displayContent(msgs[msgs.length - 1]?.content as never);
	}

	async function decide(decision: 'approve' | 'reject' | 'edit') {
		if (!agent || !pending) return;
		const current = pending;
		busy = true;
		try {
			let value: Record<string, unknown> = { decision };
			if (decision === 'edit') {
				try {
					value = { decision: 'edit', args: JSON.parse(editArgs) };
				} catch {
					value = { decision: 'approve' }; // bad JSON → fall back to approve
				}
			}
			log = [...log, { tool: current.tool, decision }];
			pending = null;
			const res = await agent.resume(value, thread);
			if (res.status === 'interrupted') presentInterrupt(res.interrupt);
			else finishFrom(res.state);
		} finally {
			busy = false;
		}
	}

	const code = `createDeepAgent({
  model,
  interruptOn: ['write_file', 'send_email', 'shell']
});

// On the host side:
let res = await agent.start({ input });
while (res.status === 'interrupted') {
  const { tool, args } = res.interrupt;
  const decision = await askHuman(tool, args); // approve | reject | edit
  res = await agent.resume(decision);
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

		<Slide title="This demo is live">
			<p>
				Click <strong>Run</strong> and the harness will pause at the first
				<code>write_file</code>. An approval card appears with the proposed path and
				content. <strong>Approve</strong> to commit, <strong>Reject</strong> to skip it,
				or <strong>Edit</strong> the arguments before they run — then the harness resumes
				to the next gated call. No write touches the filesystem until you approve it.
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
			<RunButton onclick={run} running={busy && !pending} label="Run with approval gate" />
		</Panel>

		{#if pending}
			<Panel title="Approval needed" subtitle={`The agent wants to call ${pending.tool}`}>
				<div class="approval">
					<div class="tool-name">{pending.tool}</div>
					<label class="args-field">
						<span class="args-label">arguments (editable)</span>
						<textarea bind:value={editArgs} rows="6" spellcheck="false"></textarea>
					</label>
					<div class="actions">
						<button class="btn approve" onclick={() => decide('approve')} disabled={busy}>
							Approve
						</button>
						<button class="btn edit" onclick={() => decide('edit')} disabled={busy}>
							Approve edited
						</button>
						<button class="btn reject" onclick={() => decide('reject')} disabled={busy}>
							Reject
						</button>
					</div>
				</div>
			</Panel>
		{/if}

		{#if log.length}
			<Panel title="Decisions">
				<ul class="decisions">
					{#each log as d, i (i)}
						<li><span class="dtool">{d.tool}</span><span class="dverb {d.decision}">{d.decision}</span></li>
					{/each}
				</ul>
			</Panel>
		{/if}

		<Panel title="Filesystem (no writes commit while paused)">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="final">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace (look for 'pause for write_file')">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.approval {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.tool-name {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-ink);
	}
	.args-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.args-label {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-ink-300);
	}
	textarea {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		color: var(--color-ink-100);
		resize: vertical;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.btn {
		padding: 0.45rem 0.85rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
		font-size: 0.82rem;
		cursor: pointer;
		background: var(--color-bg);
		color: var(--color-ink-100);
	}
	.btn.approve {
		background: #4caf7d;
		border-color: #4caf7d;
		color: #06210f;
		font-weight: 600;
	}
	.btn.reject {
		border-color: #e07a72;
		color: #e07a72;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.decisions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.decisions li {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.dtool {
		color: var(--color-ink-200);
	}
	.dverb {
		text-transform: uppercase;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
	}
	.dverb.approve {
		color: #4caf7d;
	}
	.dverb.reject {
		color: #e07a72;
	}
	.dverb.edit {
		color: var(--accent-ink);
	}
	.final {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
