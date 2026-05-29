<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { interruptResume } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { MemorySaver, Command } from '@langchain/langgraph/web';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { buildInterruptGraph } from '$lib/demos/lg-interrupts';
	import lgInterruptsSrc from '$lib/demos/lg-interrupts.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'interrupts',
		title: 'Interrupts & HITL',
		summary: 'Pause a graph mid-run with interrupt(), then resume with Command({ resume }).',
		entries: [{ path: 'lib/demos/lg-interrupts.ts', code: lgInterruptsSrc }],
		runner: `import { MemorySaver, Command } from '@langchain/langgraph/web';
import { buildInterruptGraph } from './lib/demos/lg-interrupts';

const config = { configurable: { thread_id: 'email-1' } };
const graph = await buildInterruptGraph(new MemorySaver());

let out = await graph.invoke({ topic: 'Q3 release notes', draft: '', final: '', decision: '' }, config);
const interrupts = out.__interrupt__;
if (interrupts?.length) {
	console.log('Paused for human approval. Proposed draft:\\n');
	console.log(interrupts[0].value.draft, '\\n');

	// Resume with the human's decision (try 'reject' or { decision: 'edit', text } too):
	out = await graph.invoke(new Command({ resume: { decision: 'approve' } }), config);
}
console.log('Final state:', out);
`
	};

	let checkpointer = new MemorySaver();
	const config = { configurable: { thread_id: 'email-1' } };

	let topic = $state('Q3 release notes');
	let busy = $state(false);
	let interrupted = $state(false);
	let interruptValue = $state<{ type: string; draft: string } | null>(null);
	let edited = $state('');
	let result = $state<{ draft?: string; final?: string; decision?: string } | null>(null);

	interface DraftPayload {
		topic: string;
		draft: string;
	}

	async function start() {
		busy = true;
		result = null;
		interrupted = false;
		interruptValue = null;
		try {
			const draftPayload = await withRunCache<DraftPayload>(
				{ demoId: `l2-interrupts-draft-${topic.slice(0, 32)}` },
				async () => {
					const graph = await buildInterruptGraph(checkpointer);
					const out = (await graph.invoke(
						{ topic, draft: '', final: '', decision: '' },
						config
					)) as Record<string, unknown>;
					const interrupts = out['__interrupt__'] as
						| Array<{ value: { type: string; draft: string } }>
						| undefined;
					const draft = interrupts?.[0]?.value?.draft ?? '';
					return { topic, draft };
				}
			);

			const graph = await buildInterruptGraph(checkpointer);
			const out = (await graph.invoke(
				{ topic, draft: draftPayload.draft, final: '', decision: '' },
				config
			)) as Record<string, unknown>;
			handleOutput(out);
		} finally {
			busy = false;
		}
	}

	function handleOutput(out: Record<string, unknown>) {
		const interrupts = out['__interrupt__'] as
			| Array<{ value: { type: string; draft: string } }>
			| undefined;
		if (interrupts && interrupts.length) {
			interrupted = true;
			interruptValue = interrupts[0].value;
			edited = interruptValue.draft;
		} else {
			interrupted = false;
			interruptValue = null;
			result = out as { draft?: string; final?: string; decision?: string };
		}
	}

	async function resume(decision: 'approve' | 'edit' | 'reject') {
		busy = true;
		try {
			const graph = await buildInterruptGraph(checkpointer);
			const cmd = new Command({
				resume: { decision, text: decision === 'edit' ? edited : undefined }
			});
			const out = (await graph.invoke(cmd as unknown as never, config)) as Record<
				string,
				unknown
			>;
			handleOutput(out);
		} finally {
			busy = false;
		}
	}

	function reset() {
		checkpointer = new MemorySaver();
		busy = false;
		interrupted = false;
		interruptValue = null;
		result = null;
		edited = '';
	}

	onMount(async () => {
		const cached = await loadCachedRun<DraftPayload>({
			demoId: `l2-interrupts-draft-${topic.slice(0, 32)}`
		});
		if (cached) {
			interrupted = true;
			interruptValue = { type: 'approve_draft', draft: cached.payload.draft };
			edited = cached.payload.draft;
		}
	});

	const code = `import { interrupt, Command, MemorySaver } from '@langchain/langgraph';

const graph = builder.compile({ checkpointer: new MemorySaver() });

// Inside a node:
const decision = interrupt({ type: 'approve_draft', draft });

// Caller side:
let out = await graph.invoke(input, { configurable: { thread_id: 't1' } });
if (out.__interrupt__) {
  // Pause and show out.__interrupt__[0].value to a human.
  const human = await askHuman(out.__interrupt__[0].value);

  // Resume:
  out = await graph.invoke(
    new Command({ resume: human }),
    { configurable: { thread_id: 't1' } }
  );
}`;

	const dangerCode = `// A delete tool you'd never want auto-run:
const decision = interrupt({
  type: 'confirm_delete',
  path: '/etc/passwd'
});
if (decision !== 'approve') return { aborted: true };
// proceed only after explicit approval`;
</script>

<Lesson
	title="Interrupts & HITL"
	eyebrow="Phase 2 · Lesson 04"
	hero={{
		id: 'l2-interrupts',
		alt: 'A scholar pauses mid-stride as a human steps out with a sealed envelope'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Some decisions belong to humans. <Term t="Interrupt">Interrupts</Term> make "pause and ask" a
		first-class language feature, not a gluey hack — the same primitive behind
		<Term t="HITL">human-in-the-loop</Term> in Phase 3.
	{/snippet}
	{#snippet intro()}
		<p>
			An <Term t="Interrupt" /> turns any <Term t="Node" /> into a "wait for the human" gate. The
			graph pauses, the <Term t="Checkpointer">checkpointer</Term> records exact
			<Term t="State" />, and execution resumes when the host calls
			<Term t="invoke">invoke</Term> with a <Term t="Command"><code>Command(&#123; resume &#125;)</code></Term>.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Approval as a primitive" variant="dropcap">
			<p>
				Every team that ships an <Term t="Agent">agent</Term> eventually invents the same hack: a
				regex, a confirmation prompt, a side-channel queue. <Term t="Interrupt">Interrupts</Term>
				make that hack a first-class graph feature. The runtime owns the pause; the
				<Term t="Checkpointer">checkpointer</Term> owns the <Term t="State" />; your code just
				declares <em>where</em> the pause lives.
			</p>
			<p>
				This is the same primitive the <Term t="Deep Agent">Deep Agents</Term> harness uses for its
				<Term t="HITL">HITL</Term> middleware in Phase 3. Wrapping a
				<Term t="tool">tool</Term> call in <Term t="interruptOn"><code>interruptOn</code></Term>
				compiles down to a <Term t="Node" /> that calls <Term t="Interrupt"
					><code>interrupt(...)</code></Term
				> and waits for a <Term t="Command"><code>Command</code></Term>. Once you see how thin the
				underlying surface is, you stop reinventing it.
			</p>
		</Slide>

		<Slide title="The mechanics" variant="code-first">
			<CodeBlock
				code={code}
				caption="Interrupt + Command(resume) is a complete pause/resume API."
			/>
			<p>
				Behind the scenes, <Term t="Interrupt"><code>interrupt(value)</code></Term> throws a special
				signal that the runtime catches. The <Term t="Checkpointer">checkpointer</Term> saves
				<Term t="State" /> with <Term t="checkpoint next"><code>next: ['approve']</code></Term>; the
				next call with a <Term t="Command"><code>Command</code></Term> and
				<Term t="resume"><code>resume</code></Term> payload continues from exactly that point.
			</p>
		</Slide>

		<Diagram spec={interruptResume} />

		<Slide variant="pull-quote">
			<p>
				The runtime owns the pause. Your code owns the policy. That separation is what makes
				<Term t="HITL">HITL</Term> a feature instead of a project.
			</p>
		</Slide>

		<Slide title="Demo · email approval">
			<p>
				The graph drafts a real internal email with the model, then
				<Term t="Interrupt">interrupts</Term>. On the right you can <em>approve</em>,
				<em>edit</em> (the textarea content becomes the <Term t="resume">resume</Term> value), or
				<em>reject</em>. Try editing then approving — you'll see the final state reflect the edit.
			</p>
		</Slide>

		<Slide title="Where you'll use this" variant="code-first">
			<p>
				Approve a tool call before running it. Let a human edit the model's plan. Require
				sign-off before sending. The same primitive scales from "send email" to "deploy to
				production" — the value object is whatever your UI needs.
			</p>
			<CodeBlock code={dangerCode} caption="Same primitive, different stakes." />
		</Slide>

		<Slide title="One pattern, many UIs" ornament>
			<p>
				Approval queues. Plan editors. Confirmation dialogs. Agent rooms with reviewers. They
				all read the same payload off <Term t="__interrupt__"><code>__interrupt__</code></Term> and
				resume with a <Term t="Command"><code>Command</code></Term>. The
				<Term t="StateGraph" /> is the contract; the UI is the wrapper.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Topic">
			<input type="text" bind:value={topic} disabled={interrupted || busy} />
			<div class="actions">
				<RunButton
					onclick={start}
					running={busy && !interrupted}
					disabled={interrupted}
					label="Draft email"
				/>
				<button class="ghost" onclick={reset}>Reset</button>
			</div>
		</Panel>

		{#if interrupted && interruptValue}
			<Panel title="Awaiting human" subtitle="Pause point: 'approve' node">
				<div class="payload">
					<div class="lbl">Type</div>
					<code>{interruptValue.type}</code>
					<div class="lbl">Proposed draft</div>
					<textarea bind:value={edited} rows="8"></textarea>
					<div class="cta">
						<button class="primary" onclick={() => resume('approve')} disabled={busy}>
							Approve as-is
						</button>
						<button class="ghost" onclick={() => resume('edit')} disabled={busy}>
							Submit edited version
						</button>
						<button class="warn" onclick={() => resume('reject')} disabled={busy}>
							Reject
						</button>
					</div>
				</div>
			</Panel>
		{/if}

		{#if result}
			<Panel title="Resumed result">
				<StateInspector state={result} title="Final state" />
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	input {
		width: 100%;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.7rem;
	}
	.ghost {
		font-size: 0.82rem;
		padding: 0.45rem 0.7rem;
		background: var(--color-bg);
		color: var(--color-ink-200);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
	}
	.ghost:hover:not(:disabled) {
		color: var(--color-ink-100);
	}

	.payload {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.lbl {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	textarea {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.55;
		resize: vertical;
	}
	.cta {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.primary {
		font-size: 0.85rem;
		padding: 0.5rem 0.85rem;
		background: var(--accent-ink);
		color: var(--color-bg);
		border: none;
		border-radius: 0.4rem;
	}
	.warn {
		font-size: 0.82rem;
		padding: 0.45rem 0.7rem;
		background: transparent;
		color: var(--color-accent-danger);
		border: 1px solid var(--color-accent-danger);
		border-radius: 0.4rem;
	}
</style>
