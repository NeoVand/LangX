<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import SlideFrame from '$lib/components/SlideFrame.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo } from '$lib/components/LiveGraph.svelte';
	import {
		buildDeckGraph,
		runDeckStream,
		type SlideBrief,
		type DeckTheme,
		type DeckEvent
	} from '$lib/demos/lg-send-fanout';
	import lgSendFanoutSrc from '$lib/demos/lg-send-fanout.ts?raw';
	import sendFanoutSkill from '$lib/demos/skills/langgraph-send-fanout.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Plus, X } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'send-fanout',
		title: 'Send & fan-out',
		summary:
			'Orchestrator-worker with Send: a plan node fans out into N parallel slide builders (one Send each), a review node critiques the merged deck behind the barrier, then fans out AGAIN — one Send per slide that needs revising.',
		entries: [{ path: 'lib/demos/lg-send-fanout.ts', code: lgSendFanoutSrc }],
		runner: `import { buildDeckGraph, runDeckStream } from './lib/demos/lg-send-fanout';

const graph = await buildDeckGraph({
  agentPrompts: [
    'You are the OPENER. Design a bold title slide.',
    'You are the EXPLAINER. Design a clear content slide with an SVG diagram.',
    'You are the CLOSER. Design a takeaways slide.'
  ]
});

const out = await runDeckStream(graph, 'why the ocean is still unexplored', {
  onEvent: (e) => {
    if (e.type === 'briefed') console.log('plan →', e.briefs.length, 'Sends');
    if (e.type === 'built') console.log('  branch', e.idx, 'filed (race!)');
    if (e.type === 'reviewed') console.log('  review', e.idx, '→', e.recommendations);
    if (e.type === 'revised') console.log('  branch', e.idx, 'revised per feedback');
  }
});
console.log(\`\\ndeck: \${out.slides.length} slides, every one revised per review feedback\`);`,
		skill: sendFanoutSkill
	};

	// ── The slide agents — one Send per card; add a card, widen the fan-out ──────
	const DEFAULT_AGENTS = [
		'You are the OPENER. Your slide hooks the audience: a bold title, a hook line that sparks curiosity, and ONE striking visual in the body — a large SVG motif or a hero stat. No bullets.',
		'You are the EXPLAINER. Your slide teaches the core idea: a two-column body with tight bullets on one side and a real SVG diagram of the mechanism on the other. Concrete beats abstract.',
		'You are the CLOSER. Your slide makes it stick: three takeaways with a bolded key word each, plus one punchy closing line in the hook position. End with conviction.'
	];
	const EXTRA_AGENT =
		'You are the WILDCARD. One surprising angle nobody expects — a bold stat, a provocative question, a what-if. Pick a body layout no other slide uses.';
	let agents = $state(DEFAULT_AGENTS.map((p, i) => ({ id: i, prompt: p })));
	let nextId = 3;
	const N = $derived(agents.length);

	// ── Run state ─────────────────────────────────────────────────────────────────
	let topic = $state('why the ocean is still unexplored');
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);
	let exploded = $state(false); // flips when plan fans out — the graph grows on screen

	interface SlideUI {
		status: 'queued' | 'building' | 'built' | 'revising' | 'revised';
		title: string;
		html: string;
		/** The first draft, kept so you can compare before/after review. */
		draftHtml: string;
		recommendations: string;
		place: number; // finishing position in the race (1-based; 0 = not finished)
	}
	let slidesUI = $state<Record<number, SlideUI>>({});
	let briefs = $state<SlideBrief[]>([]);
	let theme = $state<DeckTheme | null>(null);
	let finishOrder = $state<number[]>([]);
	let reviseIdxs = $state<number[]>([]); // slides the reviewer has critiqued (all of them)
	let showDraft = $state<Record<number, boolean>>({}); // before/after toggle per slide
	let expandedIdx = $state<number | null>(null);

	const phaseLabel = $derived.by(() => {
		const states = Object.values(slidesUI);
		if (!busy && !done) return 'edit the agents, pick a topic, build';
		if (busy && !exploded) return 'planning the deck…';
		if (busy && states.some((s) => s.status === 'revising'))
			return 'review critiqued every slide — revising in parallel';
		if (busy && states.length && states.every((s) => s.status === 'built'))
			return 'the reviewer is critiquing the whole deck…';
		if (busy) return `${finishOrder.length}/${briefs.length || N} branches filed — they race`;
		return `done — ${states.length} slides, each revised per review feedback`;
	});

	// ── The live graph — it literally GROWS when the Sends fire ──────────────────
	const COLLAPSED_NODES = [
		{ id: '__start__', label: 'START', cx: 170, cy: 28, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'plan', label: 'plan', sub: 'briefs + theme', cx: 170, cy: 98, w: 132, h: 46, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'build', label: 'build', sub: 'fans out ×N', cx: 170, cy: 188, w: 132, h: 46, shape: 'box' as const, variant: 'fanout' as const },
		{ id: 'review', label: 'review', sub: 'critiques the deck', cx: 170, cy: 278, w: 132, h: 46, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'revise', label: 'revise', sub: 'applies feedback', cx: 170, cy: 368, w: 132, h: 46, shape: 'box' as const, variant: 'fanout' as const },
		{ id: '__end__', label: 'END', cx: 170, cy: 438, w: 52, h: 26, shape: 'pill' as const }
	];
	const COLLAPSED_EDGES = [
		{ from: '__start__', to: 'plan' },
		{ from: 'plan', to: 'build', label: 'Send ×N' },
		{ from: 'build', to: 'review', label: 'reducer merge' },
		{ from: 'review', to: 'revise', label: 'Send ×N' },
		{ from: 'review', to: '__end__', label: 'nothing to fix', bow: 96, labelDy: 0 },
		{ from: 'revise', to: '__end__' }
	];
	const explodedNodes = $derived.by(() => {
		const n = briefs.length || N;
		const spread = 106;
		return [
			{ id: '__start__', label: 'START', cx: 170, cy: 30, w: 52, h: 26, shape: 'pill' as const },
			{ id: 'plan', label: 'plan', sub: 'briefs + theme', cx: 170, cy: 104, w: 132, h: 46, shape: 'box' as const, variant: 'llm' as const },
			...Array.from({ length: n }, (_, i) => ({
				id: `build-${i}`,
				label: `build #${i + 1}`,
				sub: briefs[i]?.title?.slice(0, 14) ?? '…',
				cx: 170 + (i - (n - 1) / 2) * spread,
				cy: 192,
				w: 96,
				h: 44,
				shape: 'box' as const,
				variant: 'llm' as const
			})),
			{ id: 'review', label: 'review', sub: 'critiques the deck', cx: 170, cy: 282, w: 132, h: 46, shape: 'box' as const, variant: 'llm' as const },
			// the second wave: one revise branch per slide the reviewer sent back,
			// each aligned under its build column
			...reviseIdxs.map((idx) => ({
				id: `revise-${idx}`,
				label: `revise #${idx + 1}`,
				sub: 'applies feedback',
				cx: 170 + (idx - (n - 1) / 2) * spread,
				cy: 372,
				w: 96,
				h: 44,
				shape: 'box' as const,
				variant: 'llm' as const
			})),
			{ id: '__end__', label: 'END', cx: 170, cy: 442, w: 52, h: 26, shape: 'pill' as const }
		];
	});
	const explodedEdges = $derived.by(() => {
		const n = briefs.length || N;
		const goodCount = n - reviseIdxs.length;
		return [
			{ from: '__start__', to: 'plan' },
			...Array.from({ length: n }, (_, i) => ({ from: 'plan', to: `build-${i}`, label: 'Send' })),
			...Array.from({ length: n }, (_, i) => ({ from: `build-${i}`, to: 'review' })),
			...reviseIdxs.map((idx) => ({ from: 'review', to: `revise-${idx}`, label: 'Send' })),
			...reviseIdxs.map((idx) => ({ from: `revise-${idx}`, to: '__end__' })),
			...(reviseIdxs.length
				? goodCount > 0
					? [{ from: 'review', to: '__end__', label: `${goodCount} good`, bow: 110, labelDy: 0 }]
					: []
				: [{ from: 'review', to: '__end__', label: 'all good' }])
		];
	});
	const graphNodes = $derived(exploded ? explodedNodes : COLLAPSED_NODES);
	const graphEdges = $derived(exploded ? explodedEdges : COLLAPSED_EDGES);

	const nodeMeta = $derived.by((): Record<string, NodeMeta> => {
		const meta: Record<string, NodeMeta> = {
			__start__: {
				desc: 'Your topic enters as state.',
				explain: { lead: 'One topic in.', body: 'The graph starts as a thin spine — plan, build, review. Watch what happens to it when the plan lands.' }
			},
			plan: {
				label: 'plan (the orchestrator)',
				desc: 'One model call: a brief per slide agent + a shared design theme.',
				explain: {
					lead: 'The orchestrator.',
					body: 'It reads your topic and your agent prompts, then writes one brief per slide and a shared theme so N independent slides still look like one deck. The conditional edge after it returns one Send per brief — that is the fan-out.'
				},
				code: `.addConditionalEdges('plan', (s) =>
  s.briefs.map((brief) => new Send('build', { brief, theme: s.theme })),
['build'])`
			},
			build: {
				label: 'build (×N workers)',
				desc: 'One worker per Send — N is decided at runtime by the plan.',
				explain: {
					lead: 'Not one node — a template for N.',
					body: 'This single node will run once per Send, all in parallel, each instance seeing only the payload its Send carried. Run the demo and watch this box split.'
				}
			},
			review: {
				label: 'review (fan-in critic)',
				desc: 'Fires once, behind the barrier. Critiques the WHOLE deck, then fans out again — one Send per slide, carrying its recommendations.',
				explain: {
					lead: 'The barrier — and a second dispatch.',
					body: 'review has a plain edge from build, so the runtime waits for every branch before running it — once. Seeing the whole merged deck lets it judge what no single branch could: crowding, weak hierarchy, two slides leaning on the same layout. It writes concrete recommendations for EVERY slide, then fans out AGAIN to apply them.'
				},
				code: `// fan out a second time — from a single node, so it's safe:
.addConditionalEdges('review', (s) =>
  s.recs.length
    ? s.recs.map((r) => new Send('revise', { draft, recommendations: r.recommendations }))
    : END,
['revise', END])`
			},
			revise: {
				label: 'revise (×N workers)',
				desc: 'One branch per slide — the second Send wave, applying the reviewer\'s instructions.',
				explain: {
					lead: 'Feedback, applied in parallel.',
					body: 'Each branch gets one slide plus the reviewer\'s instructions for it, and returns the improved slide. Same Send mechanics as build — the graph fans out as wide as the criticism.'
				}
			},
			__end__: {
				desc: 'The deck is assembled.',
				explain: { lead: 'Fan-out, fan-in, fan-out again.', body: 'One node became N branches, collapsed to one critic, and fanned out again to fix what it flagged — map-reduce, declared as graph shape.' }
			}
		};
		briefs.forEach((b, i) => {
			meta[`build-${i}`] = {
				label: `build · slide ${i + 1}`,
				desc: 'A parallel worker branch. It sees ONLY its Send payload — not the whole state.',
				explain: {
					lead: 'Its entire world is the payload.',
					body: `This branch received the brief "${b.title}" plus the shared theme — nothing else. No conversation history, no sibling slides. Small inputs, clean parallelism.`
				},
				code: `// the Send payload this branch received as its state:
${JSON.stringify({ idx: b.idx, brief: { title: b.title, directive: b.directive }, theme }, null, 2)}`
			};
		});
		reviseIdxs.forEach((idx) => {
			meta[`revise-${idx}`] = {
				label: `revise · slide ${idx + 1}`,
				desc: 'Second-wave worker: applies the reviewer\'s instructions to one slide.',
				explain: {
					lead: 'One slide, one set of instructions.',
					body: 'Spawned by the review node\'s conditional edge. Its payload is the draft plus the recommendations — again, nothing else.'
				},
				code: `// the Send payload this branch received as its state:
${JSON.stringify({ idx, recommendations: slidesUI[idx]?.recommendations ?? '', draft: '<the current slide markup>' }, null, 2)}`
			};
		});
		return meta;
	});

	// ── Frames for playback ───────────────────────────────────────────────────────
	interface FrameSnap {
		briefsN: number;
		built: number;
		sentBack: number;
		statuses: string[];
		titles: string[];
		recs: string[];
	}
	let frames = $state<{ node: string; snap: FrameSnap }[]>([]);
	let frameIdx = $state(0);
	const snap = (): FrameSnap => ({
		briefsN: briefs.length,
		built: finishOrder.length,
		sentBack: reviseIdxs.length,
		statuses: Array.from({ length: briefs.length || N }, (_, i) => slidesUI[i]?.status ?? 'queued'),
		titles: Array.from({ length: briefs.length || N }, (_, i) => slidesUI[i]?.title ?? ''),
		recs: Array.from({ length: briefs.length || N }, (_, i) => slidesUI[i]?.recommendations ?? '')
	});
	function pushFrame(node: string) {
		frames = [...frames, { node, snap: snap() }];
		frameIdx = frames.length - 1;
	}

	function describe(node: string, s: FrameSnap): StepInfo | null {
		if (node === '__start__') return { summary: 'One run begins — the graph is still a thin spine' };
		if (node === 'plan')
			return {
				summary: `Planned ${s.briefsN} briefs + a shared theme`,
				stateChange: 'briefs, theme set',
				insight: `The conditional edge returned ${s.briefsN} Send objects — the graph just grew ${s.briefsN} branches.`
			};
		const m = node.match(/^build-(\d+)$/);
		if (m) {
			const i = Number(m[1]);
			const st = s.statuses[i];
			return {
				summary: st === 'building' ? `Drafting “${s.titles[i]}”…` : `Filed “${s.titles[i]}”`,
				stateChange: st === 'building' ? undefined : 'drafts +1 (reducer merge)',
				insight: 'Runs in parallel with its siblings — finish order is a race.'
			};
		}
		const r = node.match(/^revise-(\d+)$/);
		if (r) {
			const i = Number(r[1]);
			return {
				summary:
					s.statuses[i] === 'revised'
						? `Revised “${s.titles[i]}” per the feedback`
						: `Revising “${s.titles[i]}”…`,
				stateChange: s.statuses[i] === 'revised' ? 'slides +1' : undefined,
				insight: s.recs[i] ? `Reviewer said: “${s.recs[i]}”` : 'Spawned by the second Send wave.'
			};
		}
		if (node === 'review')
			return {
				summary: `Critiqued ${s.briefsN} slides — recommendations for every one`,
				stateChange: 'recs set',
				insight: 'Fired once, behind the barrier — judging the whole deck at once is what lets it catch repetition across slides.'
			};
		if (node === '__end__') return { summary: `Deck assembled — ${s.briefsN} slides, each improved by review` };
		return null;
	}
	function toState(s: FrameSnap): Record<string, unknown> {
		return { topic, briefs: s.briefsN, 'drafts (merged)': s.built, 'sent back': s.sentBack };
	}

	// ── Run ───────────────────────────────────────────────────────────────────────
	function handleEvent(e: DeckEvent) {
		if (e.type === 'briefed') {
			briefs = e.briefs;
			theme = e.theme;
			exploded = true;
			const ui: Record<number, SlideUI> = {};
			e.briefs.forEach(
				(b) => (ui[b.idx] = { status: 'queued', title: b.title, html: '', draftHtml: '', recommendations: '', place: 0 })
			);
			slidesUI = ui;
			pushFrame('plan');
		} else if (e.type === 'building') {
			slidesUI = { ...slidesUI, [e.idx]: { ...slidesUI[e.idx], status: 'building', title: e.title } };
			pushFrame(`build-${e.idx}`);
		} else if (e.type === 'built') {
			finishOrder = [...finishOrder, e.idx];
			slidesUI = {
				...slidesUI,
				[e.idx]: { ...slidesUI[e.idx], status: 'built', html: e.html, draftHtml: e.html, place: finishOrder.length }
			};
			pushFrame(`build-${e.idx}`);
		} else if (e.type === 'reviewed') {
			const first = reviseIdxs.length === 0;
			reviseIdxs = [...reviseIdxs, e.idx].sort((a, b) => a - b);
			slidesUI = { ...slidesUI, [e.idx]: { ...slidesUI[e.idx], recommendations: e.recommendations } };
			if (first) pushFrame('review');
		} else if (e.type === 'revising') {
			slidesUI = { ...slidesUI, [e.idx]: { ...slidesUI[e.idx], status: 'revising' } };
			pushFrame(`revise-${e.idx}`);
		} else if (e.type === 'revised') {
			slidesUI = { ...slidesUI, [e.idx]: { ...slidesUI[e.idx], status: 'revised', html: e.html } };
			pushFrame(`revise-${e.idx}`);
		}
	}

	async function run() {
		if (busy || !topic.trim()) return;
		busy = true;
		error = '';
		done = false;
		exploded = false;
		briefs = [];
		theme = null;
		slidesUI = {};
		finishOrder = [];
		reviseIdxs = [];
		showDraft = {};
		expandedIdx = null;
		frames = [];
		frameIdx = 0;
		pushFrame('__start__');
		try {
			const graph = await buildDeckGraph({ agentPrompts: agents.map((a) => a.prompt) });
			await runDeckStream(graph, topic.trim(), { onEvent: handleEvent });
			done = true;
			pushFrame('__end__');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function addAgent() {
		if (agents.length >= 5) return;
		agents = [...agents, { id: nextId++, prompt: EXTRA_AGENT }];
	}
	function removeAgent(id: number) {
		if (agents.length <= 1) return;
		agents = agents.filter((a) => a.id !== id);
	}

	const starters = ['why the ocean is still unexplored', 'the history of coffee', 'how rockets land themselves'];
	const started = $derived(busy || done || briefs.length > 0);
	const slideIndices = $derived(briefs.map((b) => b.idx));
	const STATUS_LABEL: Record<SlideUI['status'], string> = {
		queued: 'briefed',
		building: 'drafting…',
		built: 'filed ✓',
		revising: 'revising per feedback…',
		revised: 'revised ✓'
	};

	// ── Narrative code ────────────────────────────────────────────────────────────
	const sendCode = `import { Send } from '@langchain/langgraph';

// A conditional edge can return Send objects — one per piece of work.
// N is decided HERE, at runtime. The graph grows to fit the job.
.addConditionalEdges('plan', (state) =>
  state.briefs.map((brief) =>
    new Send('build', { brief, theme: state.theme })
    //                 └── this payload is the branch's ENTIRE state
  ),
['build'])`;
	const mergeCode = `// Each of the N parallel branches returns one element…
return { drafts: [oneSlide] };

// …and the channel's reducer concatenates the parallel writes — the fan-in:
drafts: Annotation<SlideDraft[]>({ reducer: (a, b) => [...a, ...b] })

// 'review' hangs on a plain edge from 'build', so the runtime holds it
// behind a barrier until EVERY branch lands — then it fires exactly once.
.addEdge('build', 'review')`;
</script>

<Lesson
	title="Send & fan-out"
	eyebrow="Level 2 · Lesson 06"
	hero={{
		id: 'l2-send-fanout',
		alt: 'A brass dispatch machine fans one letter out to a row of mechanical scribes, whose pages flow back into a single bound volume'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="Map-reduce">Map-reduce</Term>, declared as graph shape. One
		<Term t="Node" /> fans out into N parallel workers with <Term t="Send">Send</Term> — and N is
		decided at runtime, by the model.
	{/snippet}
	{#snippet intro()}
		<p>
			A <Term t="Conditional edge">conditional edge</Term> usually answers “which node next?” — but
			it can also return an array of <Term t="Send"><code>Send</code></Term> objects, each spawning a
			parallel branch with its own private payload. Their writes merge back through your
			<Term t="Reducer">reducers</Term>. The demo builds a real slide deck this way: one plan, N
			slide agents working in parallel, one review.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="The graph that grows" variant="dropcap">
			<p>
				Every graph so far had a fixed cast: you drew the <Term t="Node">nodes</Term> at build time
				and the run walked among them. But real work rarely comes in fixed quantities — a research
				question splits into however many leads it splits into; a deck has however many slides the
				story needs. Hand-rolling that with <code>Promise.all</code> means you own the concurrency,
				the partial failures, and the merge — and your graph can't see any of it.
			</p>
			<p>
				<Term t="Send">Send</Term> moves that parallelism <em>into</em> the graph. The
				<Term t="Conditional edge">conditional edge</Term> returns one <code>Send</code> per piece of
				work, the runtime runs every branch in the same <Term t="Superstep">superstep</Term>, and
				your <Term t="Reducer">reducers</Term> define what “merge” means. The docs call the pattern
				<strong>orchestrator-worker</strong>.
			</p>
		</Slide>

		<Slide title="One Send per piece of work" variant="code-first">
			<p>
				Each <Term t="Send"><code>Send</code></Term> names a target node and carries a custom
				payload — and that payload becomes the branch's <em>entire</em>
				<Term t="State">state</Term>. Workers don't see the conversation, the other branches, or
				anything you didn't hand them. Small inputs, clean parallelism.
			</p>
			<CodeBlock code={sendCode} caption="N branches, decided at runtime — the map step." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="send-fanout-dispatch"
				alt="A brass dispatcher splits one task into several labelled capsules, each shooting down its own pneumatic tube to a waiting worker machine."
			/>
			<figcaption>
				The dispatch: one node returns N <code>Send</code> objects, and the runtime spawns N parallel
				branches — each holding only its own payload.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A <Term t="Send">Send</Term> is delegation with a return envelope: you choose the worker and
				pack its briefcase, the runtime runs them all at once and gathers what comes back.
			</p>
		</Slide>

		<Slide title="The fan-in: reducers + a barrier" variant="code-first">
			<p>
				Parallel branches all write to the same channel, so the channel needs a
				<Term t="Reducer">reducer</Term> — concatenation, here. And the node after the fan-out runs
				behind a barrier: the runtime won't fire it until <em>every</em> branch has landed. Finish
				order is a race; the merged result is not.
			</p>
			<CodeBlock code={mergeCode} caption="Reducers merge the writes; the barrier times the join." />
			<p>
				And the fan-in node can fan out <em>again</em>: in the demo, <code>review</code> sees the
				whole merged deck — which is what lets it catch crowding and repetition <em>across</em>
				slides — then returns a second wave of <Term t="Send"><code>Send</code></Term>s, one per
				slide, each carrying that slide's critique. Fanning out from a single node is always safe;
				it fires once.
			</p>
			<p class="aside">
				(Need a fan-in node to wait across <em>multiple</em> supersteps of uneven-length branches?
				Mark it <code>defer: true</code> and it waits for the whole graph to quiesce first.)
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="send-fanout-merge"
				alt="Several pneumatic tubes converge on a single brass collector that binds incoming pages into one volume behind a closed gate."
			/>
			<figcaption>
				The fan-in: reducer-merged writes accumulate, and the next node fires once — after the
				barrier opens.
			</figcaption>
		</figure>

		<Slide title="What this unlocks" ornament>
			<p>
				Multi-source research, parallel translation, batched code review, panels of
				<Term t="LLM">LLM</Term> judges, every “split the work, gather the answers” loop — declared in
				one <Term t="Conditional edge">conditional edge</Term>, observable as a
				<Term t="StateGraph" />, and resumable like any other graph because the runtime owns the
				join.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Graph API — the Send pattern', href: 'https://docs.langchain.com/oss/javascript/langgraph/graph-api', kind: 'docs' },
				{ label: 'Workflows & agents — orchestrator-worker', href: 'https://docs.langchain.com/oss/javascript/langgraph/workflows-agents', kind: 'docs' },
				{ label: 'Send — API reference', href: 'https://reference.langchain.com/javascript/langchain-langgraph/index/Send', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="one topic · N slide agents, in parallel">
			<ol class="howto">
				<li>
					<strong>Meet your slide agents.</strong> Each card below is one worker — edit its prompt,
					remove one, or add a fourth. The fan-out is exactly as wide as this list.
				</li>
				<li>
					<strong>Build the deck.</strong> Watch the graph <em>grow</em> when the plan fans out and the
					branches race (finish order changes run to run). Behind the barrier, a reviewer critiques
					every slide and sends each back with recommendations — a <em>second</em> fan-out. Flip
					<strong>before / after</strong> on a slide to see what the review changed, and
					<strong>click a slide to view it full size.</strong>
				</li>
			</ol>
		</Panel>

		<Panel title="The slide agents" subtitle={`${N} agent${N === 1 ? '' : 's'} → ${N} Send${N === 1 ? '' : 's'} → ${N} parallel branch${N === 1 ? '' : 'es'}`}>
			{#snippet actions()}
				<button class="add" onclick={addAgent} disabled={busy || agents.length >= 5} title="Add a slide agent — the graph will fan out one branch wider">
					<Plus size={14} /><span>agent</span>
				</button>
			{/snippet}
			<div class="agents">
				{#each agents as agent, i (agent.id)}
					<div class="agent">
						<header>
							<span class="aname">slide agent {i + 1}</span>
							{#if agents.length > 1}
								<button class="rm" onclick={() => removeAgent(agent.id)} disabled={busy} title="Remove this agent (one branch fewer)">
									<X size={13} />
								</button>
							{/if}
						</header>
						<textarea bind:value={agent.prompt} rows="2" disabled={busy} spellcheck="false"></textarea>
					</div>
				{/each}
			</div>

			<label class="prompt">
				<span>Deck topic…</span>
				<input
					type="text"
					bind:value={topic}
					disabled={busy}
					placeholder="anything — e.g. why the ocean is still unexplored"
					onkeydown={(e) => { if (e.key === 'Enter') run(); }}
				/>
			</label>
			<div class="starters">
				{#each starters as s (s)}
					<button class="starter" onclick={() => { topic = s; run(); }} disabled={busy}>{s}</button>
				{/each}
			</div>
			<RunButton onclick={run} running={busy} label={done ? 'Build another deck' : 'Build the deck'} />
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if started}
			<Panel title="The deck" subtitle={phaseLabel}>
				{#if !slideIndices.length}
					<p class="empty">The plan is writing briefs — the fan-out width is decided next…</p>
				{/if}
				<div class="deck">
					{#each slideIndices as idx (idx)}
						{@const s = slidesUI[idx]}
						{@const hasBoth = s.status === 'revised' && s.draftHtml && s.draftHtml !== s.html}
						<div class="slide-row">
							<header>
								<span class="stitle">{idx + 1} · {s.title}</span>
								<span class="chips">
									{#if s.place > 0}<span class="chip place">#{s.place} to finish</span>{/if}
									{#if hasBoth}
										<span class="ba" role="group" aria-label="Compare before and after review">
											<button class:on={showDraft[idx]} onclick={() => (showDraft = { ...showDraft, [idx]: true })}>before</button>
											<button class:on={!showDraft[idx]} onclick={() => (showDraft = { ...showDraft, [idx]: false })}>after</button>
										</span>
									{/if}
									<span class="chip {s.status}">{STATUS_LABEL[s.status]}</span>
								</span>
							</header>
							{#if s.html}
								<button class="slide-open" onclick={() => (expandedIdx = idx)} title="Expand">
									<SlideFrame html={hasBoth && showDraft[idx] ? s.draftHtml : s.html} title={s.title} />
								</button>
								{#if s.recommendations}
									<p class="notes">reviewer: {s.recommendations}</p>
								{/if}
							{:else}
								<div class="slide-skel" class:pulse={s.status === 'building'}></div>
							{/if}
						</div>
					{/each}
				</div>
			</Panel>

			<Panel title="The graph, live" subtitle="watch it grow — hover a branch to see the payload it received">
				<div class="graph-wrap">
					<LiveGraph nodes={graphNodes} edges={graphEdges} {frames} bind:frameIdx meta={nodeMeta} {describe} {toState} />
				</div>
			</Panel>
		{/if}

		{#if expandedIdx !== null && slidesUI[expandedIdx]?.html}
			{@const xs = slidesUI[expandedIdx]}
			{@const xBoth = xs.status === 'revised' && xs.draftHtml && xs.draftHtml !== xs.html}
			<div class="lightbox" role="dialog" aria-modal="true" aria-label="Slide preview">
				<button class="backdrop" onclick={() => (expandedIdx = null)} aria-label="Close"></button>
				<div class="lightbox-card">
					<header>
						<span>{expandedIdx + 1} · {xs.title}</span>
						<span class="lb-actions">
							{#if xBoth}
								<span class="ba" role="group" aria-label="Compare before and after review">
									<button class:on={showDraft[expandedIdx]} onclick={() => (showDraft = { ...showDraft, [expandedIdx!]: true })}>before</button>
									<button class:on={!showDraft[expandedIdx]} onclick={() => (showDraft = { ...showDraft, [expandedIdx!]: false })}>after</button>
								</span>
							{/if}
							<button class="close" onclick={() => (expandedIdx = null)} aria-label="Close"><X size={16} /></button>
						</span>
					</header>
					<SlideFrame
						html={xBoth && showDraft[expandedIdx] ? xs.draftHtml : xs.html}
						title={xs.title}
						interactive
					/>
				</div>
			</div>
		{/if}
	{/snippet}
</Lesson>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') expandedIdx = null; }} />

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

	/* Agent cards */
	.agents {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-bottom: 0.8rem;
	}
	.agent {
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		background: var(--color-bg);
		overflow: hidden;
	}
	.agent header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.6rem 0.1rem;
	}
	.aname {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--accent-ink);
	}
	.agent textarea {
		width: 100%;
		border: 0;
		background: transparent;
		resize: vertical;
		padding: 0.25rem 0.6rem 0.5rem;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--color-fg-muted);
		font-family: var(--font-prose);
		min-height: 2.6rem;
	}
	.agent textarea:focus {
		outline: none;
		color: var(--color-fg);
	}
	.rm {
		display: inline-flex;
		padding: 0.15rem;
		border: 0;
		background: transparent;
		color: var(--color-fg-faint);
		cursor: pointer;
		border-radius: 0.3rem;
	}
	.rm:hover:not(:disabled) {
		color: var(--color-accent-warning);
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.28rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		font-size: 0.74rem;
		cursor: pointer;
	}
	.add:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.add:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.prompt {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.6rem;
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
		margin-bottom: 0.7rem;
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
	.err {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}
	.empty {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		font-style: italic;
		margin: 0;
	}

	/* The deck */
	.deck {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.slide-row header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}
	.stitle {
		font-family: var(--font-display);
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	.chips {
		display: inline-flex;
		gap: 0.3rem;
		flex-shrink: 0;
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		color: var(--color-fg-faint);
	}
	.chip.building,
	.chip.revising {
		color: var(--accent);
		border-color: var(--accent-rule);
	}
	.chip.built,
	.chip.revised {
		color: var(--color-accent-success, #4caf6e);
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 40%, transparent);
	}
	/* before/after segmented toggle */
	.ba {
		display: inline-flex;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		overflow: hidden;
	}
	.ba button {
		border: 0;
		background: transparent;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.12rem 0.5rem;
		cursor: pointer;
	}
	.ba button.on {
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		color: var(--accent);
	}
	.lb-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}
	.chip.place {
		color: var(--accent-ink);
		border-color: var(--accent-rule);
		background: color-mix(in oklch, var(--accent) 8%, transparent);
	}
	.slide-open {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: zoom-in;
		border-radius: 0.45rem;
	}
	.slide-open:hover :global(.slide-frame) {
		border-color: var(--accent);
	}
	.notes {
		margin: 0.3rem 0 0;
		font-size: 0.74rem;
		font-style: italic;
		line-height: 1.45;
		color: var(--color-fg-muted);
		border-left: 2px solid var(--accent-rule);
		padding-left: 0.55rem;
	}
	.slide-skel {
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: 0.45rem;
		border: 1px dashed var(--color-rule);
		background: color-mix(in oklch, var(--color-fg) 3%, transparent);
	}
	.slide-skel.pulse {
		animation: skel 1.4s ease-in-out infinite;
		border-color: var(--accent-rule);
	}
	@keyframes skel {
		50% {
			background: color-mix(in oklch, var(--accent) 7%, transparent);
		}
	}

	/* Lightbox */
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 4vmin;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: color-mix(in oklch, var(--color-bg) 78%, black);
		backdrop-filter: blur(3px);
		cursor: zoom-out;
	}
	.lightbox-card {
		position: relative;
		width: min(1100px, 92vw);
		max-height: 92vh;
		background: var(--color-bg-elev);
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		padding: 0.6rem 0.8rem 0.8rem;
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
	}
	.lightbox-card header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--color-fg);
	}
	.close {
		display: inline-flex;
		padding: 0.25rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.close:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.graph-wrap :global(svg[aria-label='Agent graph']) {
		display: block;
		height: 420px;
		width: auto;
		max-width: 100%;
		margin: 0 auto;
	}
</style>
