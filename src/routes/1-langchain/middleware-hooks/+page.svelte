<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { MIDDLEWARES, runWithMiddleware, type HookEvent } from '$lib/demos/middleware-hooks';
	import mwSrc from '$lib/demos/middleware-hooks.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'middleware-hooks',
		title: 'Middleware & hooks',
		summary: 'Wrap one model call in a stack of middleware with before/after hooks.',
		entries: [{ path: 'lib/demos/middleware-hooks.ts', code: mwSrc }],
		runner: `import { MIDDLEWARES, runWithMiddleware } from './lib/demos/middleware-hooks';

const stack = [MIDDLEWARES.persona, MIDDLEWARES.guard, MIDDLEWARES.stamp];
const answer = await runWithMiddleware('My password is hunter2 — say hello.', stack, (e) =>
  console.log(e.phase, e.name, '·', e.note)
);
console.log(answer);
`
	};

	let prompt = $state('My password is hunter2 — tell me a fun fact.');
	let on = $state({ persona: true, guard: true, stamp: true });
	let running = $state(false);
	let answer = $state('');
	let events = $state<HookEvent[]>([]);
	let error = $state('');

	async function run() {
		running = true;
		answer = '';
		events = [];
		error = '';
		try {
			const stack = (['persona', 'guard', 'stamp'] as const)
				.filter((k) => on[k])
				.map((k) => MIDDLEWARES[k]);
			answer = await runWithMiddleware(prompt, stack, (e) => (events = [...events, e]));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	const code = `interface Middleware {
  name: string;
  before?: (ctx) => ctx;   // hook: runs before the model
  after?:  (answer) => answer; // hook: runs after the model
}

// before hooks run top→bottom; after hooks unwind bottom→top
for (const m of stack)            ctx    = m.before?.(ctx) ?? ctx;
const answer0 = await model.invoke([sys(ctx), user(ctx)]);
let answer = answer0;
for (const m of [...stack].reverse()) answer = m.after?.(answer) ?? answer;`;
</script>

<Lesson
	title="Middleware & hooks"
	eyebrow="Level 1 · Lesson 08"
	hero={{ id: 'lc-middleware-hooks-hero', alt: 'Brass valves inserted along a pipe with before/after taps' }}
	source={demoSource}
>
	{#snippet motivation()}
		Once you have a loop, you rarely want to rewrite it every time you need to log a call, redact a
		secret, or change the persona. <Term t="Middleware" /> and <Term t="Hooks">hooks</Term> let you
		slot that behavior in — around and at specific points of the loop — as configuration.
	{/snippet}
	{#snippet intro()}
		<p>
			<Term t="Middleware" /> is a layer you wrap around a step; a <Term t="Hooks">hook</Term> is a
			single point inside it where your code runs. Together they let you shape what the
			<Term t="Model" /> sees and what it returns without touching the core — the same mechanism
			Level 2's <Term t="LangGraph" /> and Level 3's <Term t="Deep Agent">Deep Agents</Term> use to
			add planning, memory, and approval gates.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The idea" title="Wrap the step, don't rewrite it" variant="dropcap">
			<p>
				Picture the model call as a pipe. <Term t="Middleware" /> drops a module onto that pipe;
				each module can carry two <Term t="Hooks">hooks</Term> — a <strong>before</strong> tap
				that edits the request on the way in, and an <strong>after</strong> tap that edits the
				reply on the way out. Stack several and you get an onion: requests travel inward
				top-to-bottom, replies travel back out bottom-to-top.
			</p>
			<CodeBlock code={code} lang="ts" caption="Middleware = a name + optional before/after hooks." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="diagram-middleware-hooks"
				alt="A pipe from input to model to output with inline middleware valves and before/after hook taps"
			/>
			<figcaption>Middleware sits on the pipe; hooks are the taps before and after each step.</figcaption>
		</figure>

		<Slide title="Three tiny middlewares">
			<p>
				On the right, toggle three of them and run:
			</p>
			<ul>
				<li><strong>persona</strong> — a <em>before</em> hook that appends a style to the system prompt.</li>
				<li><strong>guard</strong> — a <em>before</em> hook that redacts secrets from your message.</li>
				<li><strong>stamp</strong> — an <em>after</em> hook that annotates the reply.</li>
			</ul>
			<p>
				Watch the trace: <em>before</em> hooks fire in order, the <Term t="Model" /> runs once,
				then <em>after</em> hooks fire in reverse. Type the word “password” and watch
				<strong>guard</strong> redact it before the model ever sees it.
			</p>
		</Slide>

		<Slide title="Why it matters" ornament>
			<p>
				This is the seam every serious framework is built on. In <Term t="LangGraph" /> middleware
				becomes nodes around the model; in <Term t="Deep Agent">Deep Agents</Term> the whole
				harness — planning, the <Term t="Virtual filesystem">file tools</Term>,
				<Term t="Context compaction">compaction</Term>,
				<Term t="HITL">human approval</Term> — is assembled as a stack of middleware. Learn the
				shape here and those chapters read as “more of the same.”
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Middleware stack" subtitle="toggle hooks, then run one model call">
			<div class="toggles">
				<label><input type="checkbox" bind:checked={on.persona} /> persona <span>before</span></label>
				<label><input type="checkbox" bind:checked={on.guard} /> guard <span>before</span></label>
				<label><input type="checkbox" bind:checked={on.stamp} /> stamp <span>after</span></label>
			</div>
			<label class="row">
				<span>Prompt</span>
				<input type="text" bind:value={prompt} />
			</label>
			<RunButton onclick={run} {running} label="Run through the stack" />
			{#if error}
				<p class="err">{error} — set a model in <a href="/setup">Setup</a>.</p>
			{/if}
			{#if answer}
				<div class="answer">{answer}</div>
			{/if}
		</Panel>
	{/snippet}

	{#snippet inspect()}
		<Panel title="Inspect · hook trace" subtitle="before ↓ · model · after ↑">
			{#if events.length === 0}
				<p class="hint">Run the stack to see each hook fire.</p>
			{:else}
				<ol class="trace">
					{#each events as e, i (i)}
						<li class="ev {e.phase}">
							<span class="ph">{e.phase}</span>
							<span class="nm">{e.name}</span>
							<span class="nt">{e.note}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 2rem 0;
	}
	.diagram :global(.hero) {
		aspect-ratio: 16 / 9;
		border-radius: 0.7rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram figcaption {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-ink-300);
		font-style: italic;
		text-align: center;
	}

	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.85rem;
	}
	.toggles label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.84rem;
		color: var(--color-ink-100);
	}
	.toggles span {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		padding: 0.05rem 0.35rem;
	}

	.row {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	.row input {
		flex: 1;
	}

	.answer {
		margin-top: 0.85rem;
		padding: 0.6rem 0.8rem;
		border-radius: 0.5rem;
		background: var(--color-bg-elev-2);
		font-size: 0.95rem;
		line-height: 1.55;
		white-space: pre-wrap;
		color: var(--color-ink-100);
	}
	.err {
		color: var(--color-accent-warning);
		font-size: 0.84rem;
		margin: 0.5rem 0 0;
	}
	.hint {
		color: var(--color-ink-300);
		font-size: 0.88rem;
		margin: 0;
	}

	.trace {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.ev {
		display: grid;
		grid-template-columns: 4rem 5rem 1fr;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.82rem;
		padding: 0.3rem 0.4rem;
		border-radius: 0.4rem;
		background: var(--color-paper);
	}
	.ev .ph {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-300);
	}
	.ev.before .ph {
		color: var(--accent);
	}
	.ev.after .ph {
		color: var(--color-accent-langgraph, var(--accent));
	}
	.ev.model {
		background: color-mix(in oklch, var(--accent) 12%, var(--color-paper));
	}
	.ev .nm {
		font-family: var(--font-mono);
		color: var(--color-ink-100);
	}
	.ev .nt {
		color: var(--color-ink-200);
	}
</style>
