<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentGraph from '$lib/components/AgentGraph.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo } from '$lib/components/LiveGraph.svelte';
	import {
		buildBureauGraph,
		runBureauTurn,
		forkBureauAtGate,
		listBureauHistory,
		Command,
		MemorySaver,
		type BureauGraph,
		type BureauSnapshot,
		type BureauEvent,
		type BureauCheckpoint,
		type ThreadConfig,
		type Angle
	} from '$lib/demos/lg-subgraphs';
	import lgSubgraphsSrc from '$lib/demos/lg-subgraphs.ts?raw';
	import subgraphsSkill from '$lib/demos/skills/langgraph-subgraphs.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { X, RotateCcw } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'subgraphs',
		title: 'Subgraphs — The Bureau',
		summary:
			'The Level-2 capstone: a live research bureau. Investigator subgraphs (frame→search→read→assess⟲→distill) work real Wikipedia in parallel via Send; a plan-approval interrupt, a coverage gate, a shared-keys synthesis subgraph, namespaced streaming, and checkpoint forking complete the product.',
		entries: [{ path: 'lib/demos/lg-subgraphs.ts', code: lgSubgraphsSrc }],
		runner: `import { buildBureauGraph, runBureauTurn, Command, MemorySaver } from './lib/demos/lg-subgraphs';

const graph = await buildBureauGraph(new MemorySaver());
const config = { configurable: { thread_id: 'case-1' } };

// 1 · run to the plan gate (the graph pauses at interrupt())
const first = await runBureauTurn(graph, { question: 'why do octopuses seem so intelligent?' }, config, {
  onUpdate: (node, ns) => console.log(ns.length ? \`  [\${ns[0].split(':')[0]}] \${node}\` : node)
});
console.log('\\npaused — proposed angles:', first.review.angles.map((a) => a.title));

// 2 · approve (edit the list freely — each angle becomes one Send → one subgraph)
const done = await runBureauTurn(graph, new Command({ resume: { angles: first.review.angles } }), config, {
  onUpdate: (node, ns) => console.log(ns.length ? \`  [\${ns[0].split(':')[0]}] \${node}\` : node)
});
console.log(\`\\n\${done.snapshot.headline} — \${done.snapshot.sources.length} live sources\`);`,
		skill: subgraphsSkill
	};

	// ── Run state ─────────────────────────────────────────────────────────────────
	type Phase = 'idle' | 'planning' | 'gate' | 'investigating' | 'done';
	let phase = $state<Phase>('idle');
	let busy = $state(false);
	let error = $state('');
	let question = $state('why do octopuses seem so intelligent?');

	let graph: BureauGraph | null = null;
	let config: ThreadConfig | null = null;
	let threadSeq = 0;

	// the plan gate (and the fork editor reuse it)
	let planAngles = $state<Angle[]>([]);
	let forkMode = $state(false);

	// the investigation board
	interface BranchUI {
		title: string;
		node: string; // inner node currently lit
		info: string;
		titles: string[]; // article titles seen
		done: boolean;
		wave: number;
		/** Latest report from each inner node — shown in the hover popover. */
		infoByNode: Record<string, string>;
	}
	let branches = $state<Record<number, BranchUI>>({});
	let wave = $state(0);
	let thinCount = $state(0);

	// the wire — raw namespaced chunks, newest last
	let wire = $state<string[]>([]);

	// result + records room
	let snapshot = $state<BureauSnapshot | null>(null);
	let history = $state<BureauCheckpoint[]>([]);

	const phaseLabel = $derived(
		phase === 'idle'
			? 'ask anything — the bureau researches live Wikipedia'
			: phase === 'planning'
				? 'the chief is drafting a research plan…'
				: phase === 'gate'
					? 'the run is PAUSED — approve or edit the plan'
					: phase === 'investigating'
						? wave > 1
							? 'follow-up wave — refilling thin angles'
							: 'investigators dispatched — subgraphs in parallel'
						: snapshot?.forked
							? 'alternate edition published (forked timeline)'
							: 'dossier published'
	);

	// ── The parent graph (LiveGraph) — fixed shape; the ×N lives INSIDE a node ───
	const NODES = [
		{ id: '__start__', label: 'START', cx: 56, cy: 36, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'intake', label: 'intake', sub: 'plans angles', cx: 178, cy: 36, w: 104, h: 44, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'gate', label: 'gate', sub: '⏸ approve plan', cx: 318, cy: 36, w: 110, h: 44, shape: 'box' as const, variant: 'interrupt' as const },
		{ id: 'investigate', label: 'investigate', sub: 'subgraph ×N', cx: 318, cy: 136, w: 116, h: 46, shape: 'box' as const, variant: 'fanout' as const },
		{ id: 'collate', label: 'collate', sub: 'fan-in · gate', cx: 178, cy: 136, w: 104, h: 44, shape: 'box' as const, variant: 'code' as const },
		{ id: 'synthesize', label: 'synthesize', sub: 'subgraph · shared keys', cx: 178, cy: 236, w: 140, h: 46, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'publish', label: 'publish', sub: 'typesets the dossier', cx: 352, cy: 236, w: 120, h: 44, shape: 'box' as const, variant: 'code' as const },
		{ id: '__end__', label: 'END', cx: 462, cy: 236, w: 52, h: 26, shape: 'pill' as const }
	];
	const EDGES = [
		{ from: '__start__', to: 'intake' },
		{ from: 'intake', to: 'gate' },
		{ from: 'gate', to: 'investigate', label: 'Send ×N' },
		{ from: 'investigate', to: 'collate' },
		{ from: 'collate', to: 'investigate', label: 'follow-up', bow: -26, labelDy: -12 },
		{ from: 'collate', to: 'synthesize' },
		{ from: 'synthesize', to: 'publish' },
		{ from: 'publish', to: '__end__' }
	];

	const nodeMeta: Record<string, NodeMeta> = {
		__start__: {
			desc: 'Your question opens a case on a fresh thread.',
			explain: { lead: 'A case begins.', body: 'Every step below is checkpointed on this thread — which is what makes the pause, the resume, and the records-room fork possible.' }
		},
		intake: {
			label: 'intake (the chief)',
			desc: 'One model call: split the question into independent research angles.',
			explain: { lead: 'The orchestrator.', body: 'The chief reads your question and drafts a plan — one angle per investigator. The plan is only a proposal: the next node hands it to you.' }
		},
		gate: {
			label: 'gate (interrupt)',
			desc: 'interrupt() pauses the whole graph mid-run; your decision resumes it.',
			explain: {
				lead: 'The human gate.',
				body: 'The run stops HERE — state checkpointed, nothing lost. Edit the angles, remove one, then approve: your decision is the value interrupt() returns. And because it is just a checkpoint, the records room can rewind to this exact moment and answer differently.'
			},
			code: `const decision = interrupt({ type: 'approve_plan', angles });
return { angles: decision.angles };`
		},
		investigate: {
			label: 'investigate (subgraph ×N)',
			desc: 'One Send per approved angle — each runs a whole compiled subgraph.',
			explain: {
				lead: 'One box outside — a machine inside.',
				body: 'From the parent\'s view this is a single node. Inside, a full graph runs per branch: frame a query → search live Wikipedia → read articles → assess (loop if thin) → distill notes. The TRANSFORM pattern: the node maps its Send payload into the subgraph\'s private schema and maps notes back out. Watch the investigation board to see inside.'
			},
			code: `.addNode('investigate', async (payload, config) => {
  const out = await investigator.invoke(payload, config); // ← whole subgraph
  return { notes: out.notes }; // translate at the boundary
})`
		},
		collate: {
			label: 'collate (fan-in + coverage gate)',
			desc: 'Fires once per wave behind the barrier; thin angles get ONE follow-up wave.',
			explain: {
				lead: 'The barrier, then a verdict.',
				body: 'The runtime holds this node until every branch has landed. Its conditional edge then reads the merged notes: angles whose evidence came back thin are re-dispatched once (with a sharper focus), everything else proceeds to synthesis.'
			}
		},
		synthesize: {
			label: 'synthesize (subgraph, shared keys)',
			desc: 'A compiled graph added DIRECTLY as a node — no wrapper.',
			explain: {
				lead: 'The second way in.',
				body: 'This subgraph\'s channels are a subset of the parent\'s, so the compiled graph slots straight into addNode. It reads question + notes, plans an outline, and writes headline + sections + sources back to the parent\'s channels automatically. One subtlety: it echoes channels it read, so the notes reducer is idempotent.'
			},
			code: `.addNode('synthesize', synthesist) // a compiled graph IS a node`
		},
		publish: {
			label: 'publish (code)',
			desc: 'Deterministic typesetting — the model never touches layout.',
			explain: { lead: 'Ink and paper.', body: 'Pure code renders the dossier: headline, cited sections, and the live source list. Keeping layout out of the model is what keeps it reliable.' }
		},
		__end__: {
			desc: 'Dossier published.',
			explain: { lead: 'Case closed — or is it?', body: 'The whole run is still in the records room. Rewind to the gate, approve a different plan, and this same thread publishes an alternate edition.' }
		}
	};

	interface FrameSnap {
		anglesN: number;
		notesN: number;
		wave: number;
		headline: string;
		sourcesN: number;
	}
	let frames = $state<{ node: string; snap: FrameSnap }[]>([]);
	let frameIdx = $state(0);
	const snapNow = (): FrameSnap => ({
		anglesN: planAngles.length || (snapshot?.angles.length ?? 0),
		notesN: snapshot?.notes.length ?? Object.values(branches).filter((b) => b.done).length,
		wave,
		headline: snapshot?.headline ?? '',
		sourcesN: snapshot?.sources.length ?? 0
	});
	function pushFrame(node: string) {
		frames = [...frames, { node, snap: snapNow() }];
		frameIdx = frames.length - 1;
	}

	function describe(node: string, s: FrameSnap): StepInfo | null {
		switch (node) {
			case '__start__':
				return { summary: 'A new case opens on a fresh thread' };
			case 'intake':
				return { summary: `The chief proposed ${s.anglesN} research angles`, stateChange: 'angles set', insight: 'Only a proposal — the gate hands it to you.' };
			case 'gate':
				return { summary: 'Paused at the human gate', insight: 'interrupt() checkpointed the run; your approval is the resume value.' };
			case 'investigate':
				return { summary: `Investigator subgraphs at work (wave ${s.wave || 1})`, stateChange: 'notes accumulate', insight: 'Each branch is a whole graph — watch the board above.' };
			case 'collate':
				return { summary: `Wave ${s.wave} collated`, insight: 'The barrier released; the coverage gate decides: follow-up or synthesize.' };
			case 'synthesize':
				return { summary: s.headline ? `Outlined + wrote: “${s.headline}”` : 'Synthesis subgraph running', stateChange: 'headline, sections, sources set' };
			case 'publish':
				return { summary: `Dossier typeset — ${s.sourcesN} live sources`, stateChange: 'dossier set' };
			case '__end__':
				return { summary: 'Published. The records room remembers every step.' };
		}
		return null;
	}
	function toState(s: FrameSnap): Record<string, unknown> {
		return { question, angles: s.anglesN, notes: s.notesN, wave: s.wave, sources: s.sourcesN };
	}

	// ── The investigator's inner graph (drawn per branch card) ───────────────────
	// Forward edges arc gently above the row; the retry loop swings BELOW it, so
	// its label sits in clear space instead of behind the nodes.
	const INNER_NODES = [
		{ id: 'frame', label: 'frame', cx: 48, cy: 30, w: 64, h: 26, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'search', label: 'search', cx: 138, cy: 30, w: 64, h: 26, shape: 'box' as const, variant: 'code' as const },
		{ id: 'read', label: 'read', cx: 228, cy: 30, w: 64, h: 26, shape: 'box' as const, variant: 'code' as const },
		{ id: 'assess', label: 'assess', cx: 318, cy: 30, w: 64, h: 26, shape: 'box' as const, variant: 'router' as const },
		{ id: 'distill', label: 'distill', cx: 408, cy: 30, w: 64, h: 26, shape: 'box' as const, variant: 'llm' as const }
	];
	const INNER_EDGES = [
		{ from: 'frame', to: 'search', bow: -9 },
		{ from: 'search', to: 'read', bow: -9 },
		{ from: 'read', to: 'assess', bow: -9 },
		{ from: 'assess', to: 'distill', bow: -9 },
		{ from: 'assess', to: 'frame', label: 'thin? retry', bow: -34, labelDy: 3 }
	];
	const INNER_IDS = new Set(INNER_NODES.map((n) => n.id));
	const INNER_DESC: Record<string, { role: string; body: string }> = {
		frame: { role: 'model node', body: 'Turns the angle (or the gap the last round missed) into ONE Wikipedia search query.' },
		search: { role: 'code node · live', body: 'Full-text searches Wikipedia and picks up to 3 articles it hasn\'t read yet.' },
		read: { role: 'code node · live', body: 'Fetches the article extracts and lead images in parallel and files them as evidence.' },
		assess: { role: 'model node · router', body: 'Judges whether the evidence answers the angle. Thin → the conditional edge loops back to frame (max 2 rounds).' },
		distill: { role: 'model node', body: 'Writes the angle\'s field notes — specific findings, each credited to its source — and returns them to the parent.' }
	};
	// hover-to-inspect for the mini-graphs (shared popover across all branch cards)
	let innerPeek = $state<{ idx: number; node: string; x: number; y: number; below: boolean } | null>(null);
	function peekInner(idx: number, t: { kind: string; id: string; rect: DOMRect } | null) {
		if (!t || t.kind !== 'node') {
			innerPeek = null;
			return;
		}
		const below = t.rect.top < 130; // not enough room above — flip under the node
		innerPeek = {
			idx,
			node: t.id,
			x: t.rect.left + t.rect.width / 2,
			y: below ? t.rect.bottom : t.rect.top,
			below
		};
	}

	// ── Handlers ──────────────────────────────────────────────────────────────────
	function pushWire(ns: string[], mode: string, what: string) {
		const [node = '', task] = (ns[0] ?? '').split(':');
		const tag = !node ? 'parent' : task ? `${node} · ${task.slice(0, 6)}…` : node;
		wire = [...wire.slice(-9), `[${tag}] ${mode} · ${what}`];
	}
	function handleEvent(e: BureauEvent, ns: string[]) {
		pushWire(ns, 'custom', e.type === 'inv' ? `${e.node} (#${e.idx + 1})` : e.type);
		if (e.type === 'angles') {
			planAngles = e.angles.map((a) => ({ ...a }));
			pushFrame('intake');
		} else if (e.type === 'inv') {
			const cur =
				branches[e.idx] ??
				({ title: planAngles[e.idx]?.title ?? `angle ${e.idx + 1}`, node: '', info: '', titles: [], done: false, wave, infoByNode: {} } satisfies BranchUI);
			const titles = e.node === 'search' && e.info !== 'nothing new' ? [...new Set([...cur.titles, ...e.info.split(' · ')])] : cur.titles;
			branches = {
				...branches,
				[e.idx]: {
					...cur,
					node: e.node,
					info: e.info,
					titles,
					done: e.node === 'distill',
					wave,
					infoByNode: { ...cur.infoByNode, [e.node]: e.info }
				}
			};
			if (e.node === 'distill') pushFrame('investigate');
		} else if (e.type === 'collate') {
			wave = e.wave;
			thinCount = e.thin;
			pushFrame('collate');
		} else if (e.type === 'synth') {
			pushFrame('synthesize');
		} else if (e.type === 'published') {
			pushFrame('publish');
		}
	}
	const handlers = {
		onEvent: handleEvent,
		onUpdate: (node: string, ns: string[]) => {
			if (ns.length > 0 || node === 'investigate' || node === 'synthesize') pushWire(ns, 'updates', node);
		}
	};

	async function refreshHistory() {
		if (graph && config) history = await listBureauHistory(graph, config.configurable.thread_id);
	}

	// ── Actions ───────────────────────────────────────────────────────────────────
	async function openCase() {
		if (busy || !question.trim()) return;
		busy = true;
		error = '';
		phase = 'planning';
		forkMode = false;
		planAngles = [];
		branches = {};
		wave = 0;
		thinCount = 0;
		wire = [];
		snapshot = null;
		history = [];
		frames = [];
		frameIdx = 0;
		pushFrame('__start__');
		try {
			graph ??= await buildBureauGraph(new MemorySaver());
			config = { configurable: { thread_id: `bureau-${++threadSeq}` } };
			const r = await runBureauTurn(graph, { question: question.trim() }, config, handlers);
			if (r.interrupted && r.review) {
				phase = 'gate';
				planAngles = r.review.angles.map((a) => ({ ...a }));
				pushFrame('gate');
			} else {
				phase = 'idle';
				error = 'The run finished without pausing — unexpected.';
			}
			await refreshHistory();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'idle';
		} finally {
			busy = false;
		}
	}

	async function dispatch() {
		if (busy || !graph || !config || planAngles.length === 0) return;
		busy = true;
		error = '';
		phase = 'investigating';
		branches = {};
		const fork = forkMode;
		forkMode = false;
		try {
			const r = fork
				? await forkBureauAtGate(graph, config.configurable.thread_id, gateCheckpointId()!, planAngles, handlers)
				: await runBureauTurn(graph, new Command({ resume: { angles: planAngles } }), config, handlers);
			snapshot = r.snapshot;
			phase = 'done';
			pushFrame('__end__');
			await refreshHistory();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'gate';
		} finally {
			busy = false;
		}
	}

	function gateCheckpointId(): string | null {
		return [...history].reverse().find((h) => h.nextNode === 'gate')?.checkpointId ?? null;
	}

	function rewind() {
		if (busy || !snapshot) return;
		forkMode = true;
		phase = 'gate';
		planAngles = snapshot.angles.map((a) => ({ ...a }));
	}

	function removeAngle(idx: number) {
		if (planAngles.length <= 1) return;
		planAngles = planAngles.filter((a) => a.idx !== idx).map((a, i) => ({ ...a, idx: i }));
	}
	function addAngle() {
		if (planAngles.length >= 5) return;
		planAngles = [
			...planAngles,
			{ idx: planAngles.length, title: 'A different lens', focus: 'describe what this investigator should chase' }
		];
	}

	const starters = [
		'why do octopuses seem so intelligent?',
		'how did the Silk Road shape the world?',
		'why is Venice sinking?'
	];
	const branchList = $derived(
		Object.entries(branches)
			.map(([k, v]) => ({ idx: Number(k), ...v }))
			.sort((a, b) => a.idx - b.idx)
	);
	const dossierDoc = $derived(
		snapshot?.dossier
			? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https://upload.wikimedia.org;"></head><body>${snapshot.dossier}</body></html>`
			: ''
	);

	// ── Narrative code ────────────────────────────────────────────────────────────
	const twoWaysCode = `// 1 · SHARED KEYS — the compiled graph IS the node (no wrapper):
const synthesist = synthBuilder.compile();        // channels ⊆ parent's
parent.addNode('synthesize', synthesist);

// 2 · TRANSFORM — different schemas; translate state at the boundary:
parent.addNode('investigate', async (payload, config) => {
  const out = await investigator.invoke(payload, config); // private schema inside
  return { notes: out.notes };                            // map back out
});
// pass \`config\` through — the subgraph inherits the checkpointer + the stream`;
	const namespaceCode = `// X-ray vision: stream the parent with subgraphs: true —
for await (const [ns, mode, data] of await graph.stream(input, {
  streamMode: ['updates', 'custom'],
  subgraphs: true                       // ← chunks become [namespace, mode, data]
})) {
  // ns = []                            → the parent graph
  // ns = ['investigate:9f31…']         → inside ONE parallel investigator
  // ns = ['synthesize:6d14…']          → inside the synthesis subgraph
}

// and the same lens works on state:
(await graph.getState(config, { subgraphs: true })).tasks[0].state`;
</script>

<Lesson
	title="Subgraphs"
	eyebrow="Level 2 · Lesson 07 · Capstone"
	hero={{
		id: 'l2-subgraphs',
		alt: 'A brass mother-machine with its panel open, revealing a complete miniature machine working inside'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A <Term t="Subgraph">subgraph</Term> is a whole graph that looks like ONE
		<Term t="Node">node</Term> from outside. It's how agent systems scale — and it's the last piece
		this level needs to build a real product.
	{/snippet}
	{#snippet intro()}
		<p>
			The capstone: <strong>The Bureau</strong>, a live research agency. Ask anything; a chief plans
			the angles, you approve them at an <Term t="Interrupt">interrupt</Term> gate, N investigator
			<Term t="Subgraph">subgraphs</Term> work real Wikipedia in parallel (one
			<Term t="Send" /> each), a coverage gate orders follow-ups, a synthesis subgraph writes a cited
			dossier — and the records room can <Term t="Time travel">rewind</Term> the case and publish an
			alternate edition.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="A graph inside a node" variant="dropcap">
			<p>
				Six lessons ago a <Term t="Node">node</Term> was a function. Then it became a model call, a
				<Term t="Tool">tool</Term> loop, a <Term t="Send">Send</Term> target. Here is the final
				promotion: a node can be a <em>whole compiled graph</em> — loops, branches,
				<Term t="Checkpoint">checkpoints</Term>, private <Term t="State">state</Term> and all. From
				outside, one box. Inside, a machine.
			</p>
			<p>
				That's not a party trick; it's how you keep big systems legible. The investigator below is a
				five-node research pipeline with its own retry loop — and the parent graph neither knows nor
				cares. It sees one step that takes an angle and returns notes. The docs call composing work
				this way the <Term t="Orchestrator-worker">orchestrator-worker</Term> architecture; Level 3
				will call the same idea a <Term t="Subagent">subagent</Term>.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="subgraphs-nested"
				alt="A cutaway brass node-box revealing a complete miniature flowchart-machine working inside, while the outer pipeline stays simple."
			/>
			<figcaption>One node outside — a complete graph inside. Encapsulation is the whole idea.</figcaption>
		</figure>

		<Slide title="Two ways in" variant="code-first">
			<p>
				If the subgraph's channels are a subset of the parent's, the compiled graph slots straight
				into <code>addNode</code> — it reads and writes the shared channels automatically. If the
				schemas differ, call it inside a node function and translate at the boundary. The Bureau
				uses both.
			</p>
			<CodeBlock code={twoWaysCode} caption="Shared keys, or transform at the boundary — both are one node to the parent." />
			<p class="aside">
				One subtlety the demo had to handle: a shared-keys subgraph <em>echoes</em> the channels it
				read back to the parent, so the parent's <Term t="Reducer">reducer</Term> for accumulated
				lists should be idempotent (drop exact repeats) — or your notes double.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="subgraphs-boundary"
				alt="Two machines with different cartridge shapes meet at a boundary, where an adapter mechanism reshapes state passing through in both directions."
			/>
			<figcaption>Different schemas meet at the boundary — the transform node is the adapter.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A subgraph is a promise kept in both directions: the parent promises not to look inside, and
				the inside promises to look like one node.
			</p>
		</Slide>

		<Slide title="X-ray vision: namespaces" variant="code-first">
			<p>
				Encapsulation is great for design and terrible for debugging — unless you can see through
				it. Pass <code>subgraphs: true</code> when streaming and every chunk arrives tagged with a
				<Term t="Namespace">namespace</Term> path: which subgraph, which parallel branch. That's how
				the investigation board below lights up the inner nodes of N machines at once.
			</p>
			<CodeBlock code={namespaceCode} caption="The namespace says WHO is speaking — parent, or a specific branch of a specific subgraph." />
			<p class="aside">
				Subgraphs also inherit the parent's <Term t="Checkpointer">checkpointer</Term> automatically
				— which is why the <Term t="Interrupt">interrupt</Term> gate and the records-room fork keep
				working even with whole graphs nested inside.
			</p>
		</Slide>

		<Slide title="The capstone, assembled" ornament>
			<p>
				Count the pieces this product reuses:
				<a href="/2-langgraph/streaming-modes"><Term t="streamMode">streaming</Term></a> drives every
				live panel, <a href="/2-langgraph/send-fanout"><Term t="Send" /> fan-out</a> dispatches the
				investigators and a <Term t="Reducer">reducer</Term>
				<Term t="fan-in">fans their notes in</Term>,
				<a href="/2-langgraph/conditional-edges"><Term t="Conditional edge">conditional edges</Term></a>
				route the evidence loop and the coverage gate,
				<a href="/2-langgraph/interrupts">an <Term t="Interrupt">interrupt</Term></a> makes the plan
				yours, and <a href="/2-langgraph/checkpointers"><Term t="Time travel">time travel</Term></a>
				forks the whole case from the records room. Subgraphs are what let all of it compose without
				collapsing into spaghetti.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Use subgraphs (patterns & persistence)', href: 'https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs', kind: 'docs' },
				{ label: 'Graph API — Send & conditional edges', href: 'https://docs.langchain.com/oss/javascript/langgraph/graph-api', kind: 'docs' },
				{ label: 'Persistence — checkpoints & time travel', href: 'https://docs.langchain.com/oss/javascript/langgraph/persistence', kind: 'docs' },
				{ label: 'MediaWiki Action API (the live archive)', href: 'https://www.mediawiki.org/wiki/API:Main_page', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="a real product: live-researched, cited, forkable">
			<ol class="howto">
				<li><strong>Open a case.</strong> The chief drafts research angles, then the run <em>pauses</em> — edit or remove angles before you dispatch. Each angle becomes one Send → one investigator subgraph.</li>
				<li><strong>Watch the board.</strong> Every investigator is a whole graph (frame → search → read → assess ⟲ → distill) working live Wikipedia — the namespaced stream lights their inner nodes.</li>
				<li><strong>Read the dossier — then rewind.</strong> The records room can fork the case at the gate: approve a different plan and publish an alternate edition from the same thread.</li>
			</ol>
		</Panel>

		<Panel title="The inquiry" subtitle={phaseLabel}>
			<label class="prompt">
				<span>Ask the bureau…</span>
				<input
					type="text"
					bind:value={question}
					disabled={busy || phase === 'gate'}
					placeholder="any question worth researching"
					onkeydown={(e) => { if (e.key === 'Enter') openCase(); }}
				/>
			</label>
			<div class="starters">
				{#each starters as s (s)}
					<button class="starter" onclick={() => { question = s; openCase(); }} disabled={busy || phase === 'gate'}>{s}</button>
				{/each}
			</div>
			<RunButton onclick={openCase} running={busy && phase === 'planning'} label={phase === 'done' ? 'Open a new case' : 'Open a case'} />
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if phase === 'gate'}
			<Panel title={forkMode ? 'The plan gate · rewound' : 'The plan gate'} subtitle={forkMode ? 'forking the timeline — approve a DIFFERENT plan' : 'the graph is paused inside interrupt()'}>
				{#snippet actions()}
					<button class="add" onclick={addAngle} disabled={busy || planAngles.length >= 5} title="Add an angle — one more Send, one more investigator">+ angle</button>
				{/snippet}
				<div class="angles">
					{#each planAngles as angle, i (angle.idx)}
						<div class="angle">
							<header>
								<span class="aname">angle {i + 1}</span>
								{#if planAngles.length > 1}
									<button class="rm" onclick={() => removeAngle(angle.idx)} disabled={busy} title="Remove — one fewer Send"><X size={13} /></button>
								{/if}
							</header>
							<input class="atitle" bind:value={angle.title} disabled={busy} />
							<textarea bind:value={angle.focus} rows="2" disabled={busy} spellcheck="false"></textarea>
						</div>
					{/each}
				</div>
				<RunButton onclick={dispatch} running={busy && phase !== 'gate'} label={forkMode ? `Dispatch the alternate plan (${planAngles.length} Sends)` : `Approve & dispatch (${planAngles.length} Send${planAngles.length === 1 ? '' : 's'})`} />
			</Panel>
		{/if}

		{#if branchList.length > 0}
			<Panel title="The investigation" subtitle={wave > 1 ? `wave ${wave} · ${thinCount} angle${thinCount === 1 ? '' : 's'} sent back out` : 'one subgraph per angle — inner nodes lit by the namespaced stream'}>
				<div class="board">
					{#each branchList as b (b.idx)}
						<div class="branch" class:done={b.done}>
							<header>
								<span class="btitle">#{b.idx + 1} · {b.title}</span>
								<span class="chip" class:on={!b.done}>{b.done ? 'notes filed ✓' : b.node || 'dispatched'}</span>
							</header>
							<div class="inner-graph">
								<AgentGraph
									nodes={INNER_NODES}
									edges={INNER_EDGES}
									activeNode={b.done ? undefined : b.node || undefined}
									path={b.done ? ['frame', 'search', 'read', 'assess', 'distill'] : b.node ? ['frame'] : []}
									inspectable={INNER_IDS}
									onInspect={(t) => peekInner(b.idx, t)}
								/>
							</div>
							{#if b.info}<p class="binfo">{b.info}</p>{/if}
							{#if b.titles.length}
								<p class="bsources">{b.titles.slice(0, 4).join(' · ')}</p>
							{/if}
						</div>
					{/each}
				</div>
				{#if wire.length}
					<div class="wire">
						<span class="wire-h">the wire · [namespace] mode · chunk</span>
						{#each wire as w, i (i)}<code>{w}</code>{/each}
					</div>
				{/if}
			</Panel>
		{/if}

		{#if innerPeek}
			{@const pb = branches[innerPeek.idx]}
			{@const pd = INNER_DESC[innerPeek.node]}
			<div class="peek" class:below={innerPeek.below} style="left:{innerPeek.x}px; top:{innerPeek.y + (innerPeek.below ? 8 : -8)}px">
				<header><strong>{innerPeek.node}</strong><span>{pd.role}</span></header>
				<p>{pd.body}</p>
				{#if pb?.infoByNode[innerPeek.node]}
					<p class="peek-live">#{innerPeek.idx + 1}: “{pb.infoByNode[innerPeek.node]}”</p>
				{/if}
			</div>
		{/if}

		{#if snapshot?.dossier}
			<Panel title="The dossier" subtitle={`“${snapshot.headline}” · ${snapshot.sources.length} live sources${snapshot.forked ? ' · alternate edition' : ''}`}>
				{#snippet actions()}
					<button class="rewind" onclick={rewind} disabled={busy} title="Time travel: fork the case at the plan gate and approve a different plan">
						<RotateCcw size={13} /><span>rewind & re-plan</span>
					</button>
				{/snippet}
				<iframe class="dossier" srcdoc={dossierDoc} sandbox="" title="Research dossier"></iframe>
				<div class="sourcelist">
					{#each snapshot.sources as s (s.url)}
						<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
					{/each}
				</div>
			</Panel>
		{/if}

		{#if frames.length > 1}
			<Panel title="The graph, live" subtitle="from outside, investigate is ONE node — the board above is its inside">
				<div class="graph-wrap">
					<LiveGraph nodes={NODES} edges={EDGES} {frames} bind:frameIdx meta={nodeMeta} {describe} {toState} pausedNode={phase === 'gate' && !forkMode ? 'gate' : undefined} />
				</div>
			</Panel>
		{/if}

		{#if history.length > 0 && phase === 'done'}
			<Panel title="The records room" subtitle="every checkpoint on this thread — rewind is just resuming an old one">
				<ul class="records">
					{#each [...history].reverse() as h (h.checkpointId)}
						<li>
							<code class="step">{h.step >= 0 ? h.step : '·'}</code>
							<span class="next">→ {h.nextNode}</span>
							{#if h.noteCount}<span class="meta">{h.noteCount} notes</span>{/if}
							{#if h.headline}<span class="meta">“{h.headline.slice(0, 36)}{h.headline.length > 36 ? '…' : ''}”</span>{/if}
							{#if h.nextNode === 'gate'}
								<button class="fork" onclick={rewind} disabled={busy}>⏮ re-plan from here</button>
							{/if}
						</li>
					{/each}
				</ul>
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

	/* Plan gate */
	.angles {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-bottom: 0.8rem;
	}
	.angle {
		border: 1px solid var(--accent-rule);
		border-radius: 0.5rem;
		background: var(--color-bg);
		overflow: hidden;
		padding-bottom: 0.2rem;
	}
	.angle header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.6rem 0;
	}
	.aname {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
	}
	.atitle {
		width: 100%;
		border: 0;
		background: transparent;
		padding: 0.15rem 0.6rem;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--color-fg);
	}
	.angle textarea {
		width: 100%;
		border: 0;
		background: transparent;
		resize: vertical;
		padding: 0 0.6rem 0.35rem;
		font-size: 0.76rem;
		line-height: 1.45;
		color: var(--color-fg-muted);
		font-family: var(--font-prose);
		min-height: 2.2rem;
	}
	.atitle:focus,
	.angle textarea:focus {
		outline: none;
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
		padding: 0.26rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		font-size: 0.72rem;
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

	/* Investigation board */
	.board {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.branch {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-bg);
		padding: 0.5rem 0.65rem 0.55rem;
		transition: border-color 0.2s ease;
	}
	.branch.done {
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 35%, transparent);
	}
	.branch header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}
	.btitle {
		font-family: var(--font-display);
		font-size: 0.86rem;
		color: var(--color-fg);
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		color: var(--color-fg-faint);
		flex-shrink: 0;
	}
	.chip.on {
		color: var(--accent);
		border-color: var(--accent-rule);
	}
	.inner-graph :global(svg[aria-label='Agent graph']) {
		display: block;
		width: 100%;
		height: auto;
		max-height: 96px;
	}

	/* hover popover for the mini-graphs */
	.peek {
		position: fixed;
		z-index: 70;
		transform: translate(-50%, -100%);
	}
	.peek.below {
		transform: translate(-50%, 0);
	}
	.peek,
	.peek.below {
		width: 252px;
		pointer-events: none;
		background: var(--color-bg-elev);
		border: 1px solid var(--accent-rule);
		border-radius: 0.5rem;
		padding: 0.5rem 0.65rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
	}
	.peek header {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		margin-bottom: 0.25rem;
	}
	.peek header strong {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--accent-ink);
	}
	.peek header span {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--color-fg-faint);
	}
	.peek p {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.45;
		color: var(--color-fg-muted);
	}
	.peek-live {
		margin-top: 0.3rem !important;
		font-style: italic;
		color: var(--accent) !important;
	}
	.binfo {
		margin: 0.25rem 0 0;
		font-size: 0.72rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}
	.bsources {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-fg-faint);
	}

	/* The wire */
	.wire {
		margin-top: 0.7rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		background: var(--color-paper);
		padding: 0.45rem 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
	}
	.wire-h {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--accent-ink);
		margin-bottom: 0.15rem;
	}
	.wire code {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Dossier */
	.dossier {
		width: 100%;
		height: 660px;
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: #f4efe4;
	}
	.sourcelist {
		margin-top: 0.55rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.sourcelist a {
		font-size: 0.72rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		color: var(--color-fg-muted);
		text-decoration: none;
	}
	.sourcelist a:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.rewind {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.28rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		font-size: 0.72rem;
		cursor: pointer;
	}
	.rewind:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Records room */
	.records {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.records li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.74rem;
		color: var(--color-fg-muted);
		border-bottom: 1px dashed color-mix(in oklch, var(--color-rule) 60%, transparent);
		padding-bottom: 0.3rem;
	}
	.records .step {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
		min-width: 1.2rem;
		text-align: right;
	}
	.records .next {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-fg);
	}
	.records .meta {
		font-size: 0.66rem;
		color: var(--color-fg-faint);
	}
	.fork {
		margin-left: auto;
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		color: var(--accent);
		font-size: 0.66rem;
		cursor: pointer;
	}
	.fork:hover:not(:disabled) {
		background: color-mix(in oklch, var(--accent) 16%, transparent);
	}

	.graph-wrap :global(svg[aria-label='Agent graph']) {
		display: block;
		height: 300px;
		width: auto;
		max-width: 100%;
		margin: 0 auto;
	}
</style>
