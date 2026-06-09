<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import PixelCanvas from '$lib/components/PixelCanvas.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo } from '$lib/components/LiveGraph.svelte';
	import {
		buildPaintGraph,
		runPaintStream,
		GRID,
		type PaintSnapshot,
		type Pixel,
		type CustomEvent
	} from '$lib/demos/lg-streaming-modes';
	import { activeModelInfo } from '$lib/runtime/llm';
	import lgStreamingSrc from '$lib/demos/lg-streaming-modes.ts?raw';
	import streamingModesSkill from '$lib/demos/skills/langgraph-streaming-modes.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Cloud, Repeat2 } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'streaming-modes',
		title: 'Streaming modes',
		summary:
			'One graph run, observed through every streaming lens at once — values, updates, messages, and custom (a node painting a picture pixel-by-pixel via config.writer).',
		entries: [{ path: 'lib/demos/lg-streaming-modes.ts', code: lgStreamingSrc }],
		runner: `import { buildPaintGraph, runPaintStream } from './lib/demos/lg-streaming-modes';

const graph = await buildPaintGraph();
let tokens = 0, pixels = 0, steps = 0;

// ONE run, every lens at once (streamMode is an array → [mode, data] tuples):
await runPaintStream(graph, 'a friendly ghost', {
  onMessages: (t) => { tokens++; process.stdout.write(t); },
  onCustom:   () => pixels++,
  onUpdates:  (node) => { steps++; console.log('\\n  · node', node); }
});
console.log(\`\\n\\nfrom ONE run: \${tokens} message tokens · \${pixels} custom pixels · \${steps} node updates\`);`,
		skill: streamingModesSkill
	};

	// ── Toggles + the active model's capabilities ────────────────────────────────
	const caps = $derived(activeModelInfo());
	let thinkingOn = $state(false);
	let loopOn = $state(false);

	// ── Live graph — its SHAPE changes when the refine loop is on ─────────────────
	const SIMPLE_NODES = [
		{ id: '__start__', label: 'START', cx: 120, cy: 34, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'narrate', label: 'caption', sub: 'writes a line', cx: 120, cy: 116, w: 132, h: 46, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'paint', label: 'paint', sub: 'draws + streams', cx: 120, cy: 214, w: 132, h: 46, shape: 'box' as const, variant: 'code' as const },
		{ id: '__end__', label: 'END', cx: 120, cy: 296, w: 52, h: 26, shape: 'pill' as const }
	];
	const SIMPLE_EDGES = [
		{ from: '__start__', to: 'narrate' },
		{ from: 'narrate', to: 'paint', label: 'messages' },
		{ from: 'paint', to: '__end__', label: 'custom' }
	];
	// Top row: START → caption → paint. Below paint, a feedback loop with critique
	// (paint ⇄ critique); paint also drops down to END. The conditional edge is the fork.
	const LOOP_NODES = [
		{ id: '__start__', label: 'START', cx: 56, cy: 52, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'narrate', label: 'caption', sub: 'writes a line', cx: 182, cy: 52, w: 116, h: 46, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'paint', label: 'paint', sub: 'draws + streams', cx: 320, cy: 52, w: 116, h: 46, shape: 'box' as const, variant: 'code' as const },
		{ id: 'critique', label: 'critique', sub: 'sees its work', cx: 250, cy: 168, w: 116, h: 46, shape: 'box' as const, variant: 'llm' as const },
		{ id: '__end__', label: 'END', cx: 392, cy: 168, w: 52, h: 26, shape: 'pill' as const }
	];
	const LOOP_EDGES = [
		{ from: '__start__', to: 'narrate' },
		{ from: 'narrate', to: 'paint' },
		{ from: 'paint', to: 'critique', label: 'refine?', bow: 26, labelDy: -8 },
		{ from: 'critique', to: 'paint', label: 'feedback', bow: 26, labelDy: 10 },
		{ from: 'paint', to: '__end__', label: 'done · custom' }
	];
	const graphNodes = $derived(loopOn ? LOOP_NODES : SIMPLE_NODES);
	const graphEdges = $derived(loopOn ? LOOP_EDGES : SIMPLE_EDGES);

	const nodeMeta: Record<string, NodeMeta> = {
		__start__: { desc: 'Your topic enters as state.', explain: { lead: 'One run begins.', body: 'Your topic becomes the graph’s state. Everything below is a different view of this single run.' } },
		narrate: {
			label: 'caption (model node)',
			desc: 'The model writes a one-line caption about your topic.',
			explain: { lead: 'The model speaks.', body: 'A short caption for whatever you asked for. Because this is an LLM call inside a node, its tokens stream out on the messages lens, one by one.' },
			code: `// tokens here surface on streamMode: 'messages'
const text = await model.invoke(prompt);`
		},
		paint: {
			label: 'paint (model + code node)',
			desc: 'The model DRAWS your topic, then we stream the drawing via config.writer.',
			explain: { lead: 'The AI draws — you watch.', body: 'The model returns a small pixel grid for your topic (that call is tagged nostream, so its tokens stay OFF the messages lens). Then code emits one event per pixel with config.writer() → the custom lens, which paints the canvas. custom can carry ANY data you invent.' },
			code: `const grid = await model.invoke(drawPrompt, { tags: ['nostream'] });
for (const px of toPixels(grid)) config.writer({ type: 'pixel', ...px }); // → custom`
		},
		critique: {
			label: 'critique (model node)',
			desc: 'Shows the model its own drawing and asks for fixes; paint redraws.',
			explain: { lead: 'It sees its work.', body: 'The drawing is rendered to an image (vision models) or shown as the grid text, and the model returns concrete fixes. paint then redraws using them — a real see-and-improve loop. Adding this node is exactly why the graph changed shape.' },
			code: `// vision: send the rendered drawing back to the model
const msg = new HumanMessage({ content: [
  { type: 'text', text: 'How do I improve this drawing?' },
  { type: 'image_url', image_url: { url: pngOfGrid } }
]});
return { feedback: await model.invoke([msg]) };`
		},
		__end__: { desc: 'The picture is complete.', explain: { lead: 'Done.', body: 'All four lenses watched the same run — values and updates tracked state, messages typed the caption, custom painted the canvas.' } }
	};

	// ── State ─────────────────────────────────────────────────────────────────────
	let prompt = $state('a red mushroom');
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);
	let pass = $state(0);

	// the canvas (driven by the custom lens)
	let pixels = $state<Pixel[]>([]);
	let caption = $state('');

	// the four lenses
	let valuesLog = $state<PaintSnapshot[]>([]);
	let updatesLog = $state<{ node: string; delta: Record<string, unknown> }[]>([]);
	let messagesText = $state('');
	let messagesCount = $state(0);
	let customLog = $state<CustomEvent[]>([]);

	// Which lens is expanded for review (null = the 2×2 overview).
	let selectedLens = $state<string | null>(null);
	const LENSES = ['values', 'updates', 'messages', 'custom'];
	const LENS_INFO: Record<string, string> = {
		values: 'full state after each step',
		updates: '{ node: delta } per step',
		messages: 'LLM tokens, one by one',
		custom: 'config.writer() — paints the canvas'
	};
	function lensCount(k: string): number {
		return k === 'values' ? valuesLog.length : k === 'updates' ? updatesLog.length : k === 'messages' ? messagesCount : customLog.length;
	}
	function lensLines(k: string): string[] {
		if (k === 'values') return valuesLog.map((s, i) => `#${i}  ${JSON.stringify({ topic: s.topic, caption: s.caption, painted: s.painted })}`);
		if (k === 'updates') return updatesLog.map((u) => `${u.node}: ${JSON.stringify(u.delta)}`);
		return customLog.map((e) => (e.type === 'pixel' ? `pixel (${String(e.x).padStart(2)}, ${String(e.y).padStart(2)})  ${e.color}` : `clear · new pass ${e.pass}`));
	}

	// the live graph
	interface FrameSnap { topic: string; caption: string; pixels: number; painted: boolean; pass: number }
	let frames = $state<{ node: string; snap: FrameSnap }[]>([]);
	let frameIdx = $state(0);

	const snap = (): FrameSnap => ({ topic: prompt, caption, pixels: pixels.length, painted: done, pass });
	function pushFrame(node: string) {
		frames = [...frames, { node, snap: snap() }];
		frameIdx = frames.length - 1;
	}

	async function paint() {
		if (busy || !prompt.trim()) return;
		busy = true;
		error = '';
		done = false;
		pixels = [];
		caption = '';
		pass = 0;
		valuesLog = [];
		updatesLog = [];
		messagesText = '';
		messagesCount = 0;
		customLog = [];
		selectedLens = null;
		frames = [];
		frameIdx = 0;
		pushFrame('__start__');
		try {
			// Build fresh each run so the toggles (loop / thinking / vision) take effect.
			const graph = await buildPaintGraph({ loop: loopOn, thinking: thinkingOn, vision: caps.vision, passes: 2 });
			await runPaintStream(graph, prompt.trim(), {
				onValues: (s) => {
					valuesLog = [...valuesLog, s];
					if (s.caption) caption = s.caption;
					pass = s.pass;
				},
				onUpdates: (node, delta) => {
					updatesLog = [...updatesLog, { node, delta }];
				},
				onMessages: (token) => {
					messagesText += token;
					messagesCount += 1;
				},
				onCustom: (e) => {
					customLog = [...customLog, e];
					if (e.type === 'clear') pixels = []; // a refine pass repaints fresh
					else pixels = [...pixels, { x: e.x, y: e.y, color: e.color, i: e.i, total: e.total }];
				},
				onNode: (node) => pushFrame(node)
			});
			done = true;
			pushFrame('__end__');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	const starters = ['a red mushroom', 'a sailboat', 'a slice of pizza', 'a smiling sun'];
	const started = $derived(busy || done || pixels.length > 0 || messagesText.length > 0);

	function describe(node: string, s: FrameSnap): StepInfo | null {
		switch (node) {
			case '__start__':
				return { summary: 'One run begins — streamed with all four modes at once' };
			case 'narrate':
				return { summary: s.caption ? `Wrote: “${s.caption}”` : 'The model writes a caption', stateChange: 'caption set', insight: 'Its tokens streamed on the messages lens.' };
			case 'paint':
				return { summary: `The model drew it${s.pass > 1 ? ` (pass ${s.pass})` : ''}; streaming ${s.pixels} pixels as custom events`, stateChange: 'painted = true', insight: 'The drawing call is nostream; each pixel is a config.writer() → custom.' };
			case 'critique':
				return { summary: 'The model reviewed its own drawing', stateChange: 'feedback set', insight: 'It sees the rendered image (vision) or the grid text, then paint redraws.' };
			case '__end__':
				return { summary: 'Same run, four lenses — all done' };
			default:
				return null;
		}
	}
	function toState(s: FrameSnap): Record<string, unknown> {
		return { topic: s.topic, caption: s.caption, pixels: s.pixels, painted: s.painted };
	}

	// ── Narrative code ────────────────────────────────────────────────────────────
	const arrayCode = `// Ask for several lenses at once — each chunk arrives as a [mode, data] tuple.
for await (const [mode, data] of await graph.stream(input, {
  streamMode: ['values', 'updates', 'messages', 'custom']
})) {
  if (mode === 'messages')     { const [chunk] = data; type(chunk.content); } // tokens
  else if (mode === 'custom')  paintPixel(data);     // YOUR events
  else if (mode === 'updates') logDelta(data);       // { node: delta }
  else if (mode === 'values')  syncState(data);      // full state
}`;
	const customCode = `// Inside a node — emit anything onto the 'custom' lens via config.writer:
async function paint(state, config) {
  for (const px of pixels) config.writer({ type: 'pixel', ...px });
  return { painted: true };
}`;
</script>

<Lesson
	title="Streaming modes"
	eyebrow="Level 2 · Lesson 05"
	hero={{ id: 'l2-streaming-modes', alt: 'A brass machine with one input pipe splitting into several glowing output ribbons' }}
	source={demoSource}
>
	{#snippet motivation()}
		Streaming isn't one feature — it's several <em>lenses</em> on the same run. Pick the right
		<Term t="streamMode">streamMode</Term> (or ask for many at once) and the UI writes itself.
	{/snippet}
	{#snippet intro()}
		<p>
			<Term t="LangGraph" /> can project one run many ways:
			<Term t="streamMode: values"><code>values</code></Term> (full <Term t="State" />),
			<Term t="streamMode: updates"><code>updates</code></Term> (per-<Term t="Node">node</Term> deltas),
			<Term t="streamMode: messages"><code>messages</code></Term> (live tokens), and
			<Term t="streamMode: custom"><code>custom</code></Term> (events a node emits itself). The demo
			runs <strong>one</strong> graph and shows all four at once — the <code>custom</code> stream
			literally paints a picture pixel-by-pixel.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="One run, many lenses" variant="dropcap">
			<p>
				Streaming an <Term t="Agent">agent</Term> isn't one question — it's several wearing the same
				word. Do you want the <em>current <Term t="State">state</Term></em> after each
				<Term t="Superstep">super-step</Term>, the <em>delta</em> a <Term t="Node" /> just produced,
				the <em>tokens</em> emerging from an <Term t="LLM">LLM</Term> call, or <em>your own</em>
				progress events? Each needs a different shape. Conflating them is why most agent UIs look
				either boringly flat or noisily jittery.
			</p>
			<p>
				LangGraph names the lenses and gives each a stable <Term t="streamMode">streamMode</Term>.
				Build the UI to the shape you need — and you can ask for several at once.
			</p>
		</Slide>

		<Slide title="The modes">
			<ul>
				<li><strong><Term t="streamMode: values">values</Term></strong> — the entire <Term t="State" /> after each super-step. For a "current state" inspector.</li>
				<li><strong><Term t="streamMode: updates">updates</Term></strong> — <code>{'{ node: delta }'}</code> after each super-step. For an event log or server sync.</li>
				<li><strong><Term t="streamMode: messages">messages</Term></strong> — <code>[chunk, metadata]</code> per LLM token. For chat-style typing; <code>metadata.langgraph_node</code> says which node spoke.</li>
				<li><strong><Term t="streamMode: custom">custom</Term></strong> — whatever you emit with <code>config.writer(...)</code>. Progress bars, telemetry, even render instructions.</li>
			</ul>
			<p class="aside">(There are two more — <code>tools</code> for tool-call lifecycle events, and <code>debug</code> for everything — same idea.)</p>
		</Slide>

		<Slide title="Stream several at once" variant="code-first">
			<p>
				Pass an <strong>array</strong> to <Term t="streamMode">streamMode</Term> and every chunk
				arrives as a <code>[mode, data]</code> tuple — one <Term t="stream">stream</Term>, every lens.
			</p>
			<CodeBlock code={arrayCode} caption="One run, observed four ways simultaneously." />
		</Slide>

		<figure class="diagram">
			<HeroImage id="streaming-modes-lenses" alt="One run feeding four labelled readouts — values, updates, messages, custom — each a distinct brass instrument." />
			<figcaption>One run, many lenses — each <code>streamMode</code> is a different projection of the same execution.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A streaming mode is just a projection. Pick the lens that matches the surface you're building —
				and stop trying to make one stream do every job.
			</p>
		</Slide>

		<Slide title="Emit your own events" variant="code-first">
			<p>
				The <Term t="streamMode: custom"><code>custom</code></Term> lens is the powerful one: a node
				calls <code>config.writer(obj)</code> and that object streams straight to your UI. Progress,
				partial results — or, here, one event per pixel that paints a canvas.
			</p>
			<CodeBlock code={customCode} caption="config.writer() — your node, your event shape." />
		</Slide>

		<figure class="diagram">
			<HeroImage id="streaming-custom" alt="A node with a little brass writer valve tapping a side-channel that streams custom event-tokens out to a gauge." />
			<figcaption>The <code>custom</code> stream carries whatever you write — the demo writes pixels.</figcaption>
		</figure>

		<Slide title="What this unlocks" ornament>
			<p>
				A debugger panel? <Term t="streamMode: values"><code>values</code></Term>. A server-pushed log?
				<Term t="streamMode: updates"><code>updates</code></Term>. A chat that types?
				<Term t="streamMode: messages"><code>messages</code></Term>. A live progress visual?
				<Term t="streamMode: custom"><code>custom</code></Term>. Same run, the right lens per surface.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Streaming (concepts & how-to)', href: 'https://docs.langchain.com/oss/javascript/langgraph/streaming', kind: 'docs' },
				{ label: 'Stream custom data (config.writer)', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/streaming-content/', kind: 'docs' },
				{ label: 'StreamMode reference', href: 'https://langchain-ai.github.io/langgraphjs/reference/types/langgraph-sdk.StreamMode.html', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="one run · four streaming lenses at once">
			<ol class="howto">
				<li><strong>Type any topic.</strong> The model actually draws it — every run is different. One graph, streamed with all four modes at once.</li>
				<li><strong>Watch the lenses.</strong> <code>messages</code> types the caption, <code>custom</code> paints the AI's drawing pixel-by-pixel, <code>values</code>/<code>updates</code> tick per node — all from the same run. <strong>Click a lens to review</strong> what it streamed.</li>
			</ol>
		</Panel>

		<Panel title="The painter" subtitle={busy ? 'streaming…' : done ? 'done — try another topic' : 'type any topic and paint'}>
			{#snippet actions()}
				<div class="toggles" role="group" aria-label="Options">
					<button
						class="toggle"
						class:on={loopOn}
						onclick={() => (loopOn = !loopOn)}
						disabled={busy}
						title="Refine loop: the model sees its own drawing and improves it — this changes the graph's shape"
						aria-pressed={loopOn}
					>
						<Repeat2 size={14} /><span>Feedback loop</span>
						{#if loopOn}<em>{caps.vision ? 'vision' : 'text'}</em>{/if}
					</button>
					{#if caps.thinking !== 'none'}
						<button
							class="toggle"
							class:on={thinkingOn}
							onclick={() => (thinkingOn = !thinkingOn)}
							disabled={busy}
							title={caps.thinking === 'hidden'
								? 'Reasoning model — turn its thinking effort up (it reasons privately; deeper = slower)'
								: 'Let the model think before drawing — slower to start, often better'}
							aria-pressed={thinkingOn}
						>
							<Cloud size={14} /><span>Thinking</span>
							{#if caps.thinking === 'hidden'}<em>private</em>{/if}
						</button>
					{/if}
				</div>
			{/snippet}
			<div class="painter">
				<PixelCanvas {pixels} cols={GRID} rows={GRID} lastIndex={pixels.length - 1} size={220} />
				{#if caption}<p class="caption">{caption}</p>{/if}

				<label class="prompt">
					<span>Paint me…</span>
					<input
						type="text"
						bind:value={prompt}
						disabled={busy}
						placeholder="anything — e.g. a red mushroom, a sailboat, a slice of pizza"
						onkeydown={(e) => { if (e.key === 'Enter') paint(); }}
					/>
				</label>
				<div class="starters">
					{#each starters as s (s)}
						<button class="starter" onclick={() => { prompt = s; paint(); }} disabled={busy}>{s}</button>
					{/each}
				</div>
				<RunButton onclick={paint} running={busy} label={done ? (loopOn ? 'Paint + refine' : 'Paint again') : loopOn ? 'Paint + refine' : 'Paint it'} />
				{#if error}<div class="err">{error}</div>{/if}
			</div>
		</Panel>

		{#if started}
			<Panel title="The four lenses" subtitle="same run, four streamMode projections — click one to review">
				<div class="lenses">
					{#each LENSES as k (k)}
						<button class="lens" class:accent={k === 'custom'} class:sel={selectedLens === k} onclick={() => (selectedLens = selectedLens === k ? null : k)}>
							<div class="lh"><span class="lname">{k}</span><span class="lct">{lensCount(k)}</span></div>
							<div class="ld">{LENS_INFO[k]}</div>
							<span class="review">{selectedLens === k ? 'hide ▲' : 'review ▾'}</span>
						</button>
					{/each}
				</div>

				{#if selectedLens}
					<div class="lens-detail">
						<header>
							<span class="lname">{selectedLens}</span>
							<span class="dh">{lensCount(selectedLens)} {selectedLens === 'messages' ? 'tokens' : 'chunks'} from this one run</span>
						</header>
						{#if selectedLens === 'messages'}
							<p class="detail-msg">{messagesText || '—'}{#if busy && messagesText}<i class="cur"></i>{/if}</p>
						{:else}
							<pre class="detail-pre">{lensLines(selectedLens).join('\n') || '—'}</pre>
						{/if}
					</div>
				{/if}
			</Panel>

			<Panel title="The graph, live" subtitle="hover a node — compose streams messages, paint streams custom">
				<div class="graph-wrap">
					<LiveGraph nodes={graphNodes} edges={graphEdges} {frames} bind:frameIdx meta={nodeMeta} {describe} {toState} />
				</div>
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 1.8rem 0;
	}
	.diagram :global(.hero) {
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		display: block;
	}
	.diagram :global(.hero .caption) {
		display: none;
	}
	.diagram figcaption {
		margin-top: 0.55rem;
		text-align: center;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}
	.aside {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
	}

	.howto {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.howto strong {
		color: var(--color-fg);
	}
	.howto code {
		font-family: var(--font-mono);
		font-size: 0.82em;
		color: var(--accent-ink);
	}

	.painter {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.caption {
		margin: 0;
		text-align: center;
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}
	.prompt {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.prompt span {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-fg-muted);
	}
	.prompt input {
		width: 100%;
	}
	.starters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.starter {
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-ink-100);
		font-size: 0.76rem;
		cursor: pointer;
	}
	.starter:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.32rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		font-size: 0.78rem;
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
	}
	.toggle :global(svg) {
		opacity: 0.8;
	}
	.toggle:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--color-fg);
	}
	.toggle.on {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in oklch, var(--accent) 12%, transparent);
	}
	.toggle:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.toggle em {
		font-style: normal;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		opacity: 0.8;
		padding: 0.02rem 0.3rem;
		border: 1px solid currentColor;
		border-radius: 999px;
	}
	.err {
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}

	/* Four-lens strip */
	.lenses {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.lens {
		display: block;
		width: 100%;
		text-align: left;
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		padding: 0.5rem 0.6rem;
		background: var(--color-bg);
		color: inherit;
		min-width: 0;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.lens:hover {
		border-color: var(--accent);
	}
	.lens.sel {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.lens.accent {
		border-color: var(--accent-rule);
		background: color-mix(in oklch, var(--accent) 5%, transparent);
	}
	.review {
		display: block;
		margin-top: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--accent);
	}
	.lh {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.lname {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--accent-ink);
		font-weight: 600;
	}
	.lct {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
		background: var(--color-bg-elev-2);
		border-radius: 999px;
		padding: 0.05rem 0.4rem;
	}
	.ld {
		font-size: 0.66rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.3rem;
	}
	.lens-detail {
		margin-top: 0.6rem;
		border: 1px solid var(--accent-rule);
		border-radius: 0.5rem;
		background: var(--color-paper);
		overflow: hidden;
	}
	.lens-detail header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--color-rule);
		background: var(--color-bg-elev);
	}
	.dh {
		font-size: 0.68rem;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
	}
	.detail-pre {
		margin: 0;
		padding: 0.6rem 0.7rem;
		max-height: 12rem;
		overflow: auto;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.detail-msg {
		margin: 0;
		padding: 0.6rem 0.7rem;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg);
		font-style: italic;
	}
	.cur {
		display: inline-block;
		width: 2px;
		height: 0.8em;
		background: var(--accent);
		margin-left: 1px;
		animation: blink 1s steps(2) infinite;
		vertical-align: text-bottom;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	.graph-wrap :global(svg[aria-label='Agent graph']) {
		display: block;
		height: 330px;
		width: auto;
		max-width: 100%;
		margin: 0 auto;
	}
</style>
