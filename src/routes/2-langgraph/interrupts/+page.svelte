<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import {
		Annotation,
		StateGraph,
		MemorySaver,
		START,
		END,
		interrupt,
		Command
	} from '@langchain/langgraph/web';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { onMount } from 'svelte';

	const State = Annotation.Root({
		topic: Annotation<string>(),
		draft: Annotation<string>(),
		final: Annotation<string>(),
		decision: Annotation<string>()
	});

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

	async function buildGraph() {
		const model = await getModel({ temperature: 0.3, maxTokens: 280 });
		const draftPrompt = ChatPromptTemplate.fromMessages([
			[
				'system',
				'You are an internal-comms editor. Draft a short, professional team email (≤ 90 words). Return ONLY the email body, including a "Subject:" line.'
			],
			['human', 'Topic: {topic}']
		]);
		const parser = new StringOutputParser();

		return new StateGraph(State)
			.addNode('draft', async (s) => {
				if (s.draft && s.draft.length > 0) return { draft: s.draft };
				const text = await draftPrompt.pipe(model).pipe(parser).invoke({ topic: s.topic });
				return { draft: text };
			})
			.addNode('approve', async (s) => {
				const decision = interrupt({
					type: 'approve_draft',
					draft: s.draft
				}) as { decision: 'approve' | 'edit' | 'reject'; text?: string };
				if (decision.decision === 'reject') {
					return { final: '', decision: 'rejected' };
				}
				if (decision.decision === 'edit') {
					return { final: decision.text ?? s.draft, decision: 'edited' };
				}
				return { final: s.draft, decision: 'approved' };
			})
			.addEdge(START, 'draft')
			.addEdge('draft', 'approve')
			.addEdge('approve', END)
			.compile({ checkpointer });
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
					const graph = await buildGraph();
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

			const graph = await buildGraph();
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
			const graph = await buildGraph();
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
	motivation="Some decisions belong to humans. Interrupts make 'pause and ask' a first-class language feature, not a gluey hack."
	hero={{
		id: 'l2-interrupts',
		alt: 'A scholar pauses mid-stride as a human steps out with a sealed envelope'
	}}
>
	{#snippet intro()}
		<p>
			An <Term t="Interrupt" /> turns any node into a "wait for the human" gate. The graph
			pauses, the checkpointer records exact state, and execution resumes when the host calls
			<code>invoke</code> with a <code>Command(&#123; resume &#125;)</code>.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Approval as a primitive" variant="dropcap">
			<p>
				Every team that ships an agent eventually invents the same hack: a regex, a
				confirmation prompt, a side-channel queue. Interrupts make that hack a first-class
				graph feature. The runtime owns the pause; the checkpointer owns the state; your code
				just declares <em>where</em> the pause lives.
			</p>
			<p>
				This is the same primitive the Deep Agents harness uses for its HITL middleware in
				Phase 3. Wrapping a tool call in <code>interruptOn</code> compiles down to a node that
				calls <code>interrupt(...)</code> and waits for a <code>Command</code>. Once you see
				how thin the underlying surface is, you stop reinventing it.
			</p>
		</Slide>

		<Slide title="The mechanics" variant="code-first">
			<CodeBlock
				code={code}
				caption="Interrupt + Command(resume) is a complete pause/resume API."
			/>
			<p>
				Behind the scenes, <code>interrupt(value)</code> throws a special signal that the
				runtime catches. The checkpointer saves state with <code>next: ['approve']</code>; the
				next call with a <code>Command</code> resumes from exactly that point.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The runtime owns the pause. Your code owns the policy. That separation is what makes
				HITL a feature instead of a project.
			</p>
		</Slide>

		<Slide title="Demo · email approval">
			<p>
				The graph drafts a real internal email with the model, then interrupts. On the right
				you can <em>approve</em>, <em>edit</em> (the textarea content becomes the resume
				value), or <em>reject</em>. Try editing then approving — you'll see the final state
				reflect the edit.
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
				all read the same payload off <code>__interrupt__</code> and resume with a
				<code>Command</code>. The graph is the contract; the UI is the wrapper.
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
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-ink-100);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-ink);
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
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-ink-100);
		line-height: 1.55;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent-ink);
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
