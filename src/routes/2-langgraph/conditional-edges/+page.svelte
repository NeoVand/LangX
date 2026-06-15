<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo, type EdgeDetail } from '$lib/components/LiveGraph.svelte';
	import {
		buildGameGraph,
		runGameTurn,
		emptyBoard,
		emptyCells,
		winner,
		turnOf,
		type Board,
		type GameSnapshot,
		type Status
	} from '$lib/demos/lg-conditional-edges';
	import lgConditionalSrc from '$lib/demos/lg-conditional-edges.ts?raw';
	import graphRunSrc from '$lib/demos/graph-run.ts?raw';
	import conditionalEdgesSkill from '$lib/demos/skills/langgraph-conditional-edges.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'conditional-edges',
		title: 'Conditional edges & reducers — tic-tac-toe',
		summary:
			'One graph that needs both: a referee + conditional edge route the game (play / stop), and two tactical scans write the same field in parallel through a concat reducer.',
		entries: [
			{ path: 'lib/demos/graph-run.ts', code: graphRunSrc },
			{ path: 'lib/demos/lg-conditional-edges.ts', code: lgConditionalSrc }
		],
		runner: `import { buildGameGraph, runGameTurn, emptyBoard, turnOf } from './lib/demos/lg-conditional-edges';

// Play a full game: a tiny scripted "human" always takes the first open cell.
const graph = await buildGameGraph();
let board = emptyBoard();
let turn = 0;
while (turnOf(board) === 'x' && board.includes('')) {
  board[board.indexOf('')] = 'x';                       // the "human" moves
  const r = await runGameTurn(graph, board, { configurable: { thread_id: \`ttt-\${turn++}\` } },
    (node) => console.log('  ·', node));
  board = r.snapshot.board;                              // adopt ◯'s reply
  console.log(board.slice(0, 3), board.slice(3, 6), board.slice(6, 9), '\\n');
  if (r.snapshot.status !== 'continue') { console.log('result:', r.snapshot.status); break; }
}`,
		skill: conditionalEdgesSkill
	};

	// ── Hand-wired layout of the game graph ──────────────────────────────────────
	const BW = 104,
		BH = 46;
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 56, cy: 54, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'referee', label: 'Referee', sub: 'judges the board', cx: 210, cy: 54, w: BW, h: BH, shape: 'box' as const, variant: 'router' as const },
		{ id: '__end__', label: 'END', cx: 372, cy: 54, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'scan_win', label: 'scan_win', sub: 'can ◯ win?', cx: 120, cy: 156, w: BW, h: BH, shape: 'box' as const, variant: 'code' as const },
		{ id: 'scan_block', label: 'scan_block', sub: 'must ◯ block?', cx: 300, cy: 156, w: BW, h: BH, shape: 'box' as const, variant: 'code' as const },
		{ id: 'decide', label: 'Decide', sub: 'picks ◯’s move', cx: 210, cy: 256, w: BW, h: BH, shape: 'box' as const, variant: 'llm' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'referee' },
		{ from: 'referee', to: '__end__', label: 'done', labelDy: -9 },
		{ from: 'referee', to: 'scan_win', label: 'play', bow: 10, labelDy: -2 },
		{ from: 'referee', to: 'scan_block', bow: -10 },
		{ from: 'scan_win', to: 'decide' },
		{ from: 'scan_block', to: 'decide' },
		{ from: 'decide', to: 'referee', label: 're-check' }
	];

	const routerCode = `.addConditionalEdges('referee', (s) => {
  if (s.status !== 'continue') return END;   // someone won, or a draw
  // ◯'s turn → run BOTH scans in parallel; ✕'s turn → hand back to the UI.
  return turnOf(s.board) === 'o' ? ['scan_win', 'scan_block'] : END;
}, ['scan_win', 'scan_block', END])`;

	const nodeMeta: Record<string, NodeMeta> = {
		__start__: {
			desc: 'The run begins; state = the board with your ✕ already placed.',
			explain: {
				lead: 'You just moved.',
				body: 'Every time you click a square, the whole board — with your ✕ on it — is handed to the graph as its starting state. From here the graph decides what happens next.'
			}
		},
		referee: {
			label: 'Referee (code node)',
			desc: 'Reads the board and sets status: x · o · draw · continue.',
			explain: {
				lead: 'Is the game over?',
				body: 'A plain function — no AI. It looks at the board and writes one field: did someone just win, is it a draw, or does play continue? The conditional edge right after it reads that answer to decide where the run goes.'
			},
			code: `// CODE node
const w = winner(s.board);
return { status: w ? w
  : emptyCells(s.board).length === 0 ? 'draw'
  : 'continue' };`
		},
		scan_win: {
			label: 'scan_win (code node)',
			desc: 'Finds a square where ◯ completes a line, if one exists.',
			explain: {
				lead: 'Can I win right now?',
				body: 'One of two scouts that run at the same time. This one checks every empty square: would placing ◯ there finish three-in-a-row? It writes its finding into the shared analysis list.'
			},
			code: `// CODE node — runs in parallel with scan_block
const cell = findWinningCell(s.board, 'o');
return { analysis: [{ kind: 'win', cell, found: cell >= 0 }] };`
		},
		scan_block: {
			label: 'scan_block (code node)',
			desc: 'Finds a square where ✕ would win next — the one to block.',
			explain: {
				lead: 'Do I have to block?',
				body: 'The other scout, running at the same instant as scan_win. It looks for a square where YOU (✕) would win on your next turn, so ◯ can block it. It writes into the same analysis list — which is exactly why that field needs a reducer.'
			},
			code: `// CODE node — runs in parallel with scan_win
const cell = findWinningCell(s.board, 'x');
return { analysis: [{ kind: 'block', cell, found: cell >= 0 }] };`
		},
		decide: {
			label: 'Decide (model node)',
			desc: 'Chooses ◯’s move: win > block > ask the model.',
			explain: {
				lead: 'Make the move.',
				body: 'This node reads what the two scouts found. If there’s a winning square, take it; otherwise block a threat; otherwise ask the language model to pick the strongest open square. Then it places ◯ and loops back to the referee to judge the new board.'
			},
			code: `// MODEL node — reads the parallel scans, then plays ◯
if (win)   cell = win.cell;          // take the win
else if (block) cell = block.cell;   // block the threat
else cell = await askModel(board);   // otherwise the LLM chooses
return { board, aiMove: cell, moves: [{ mark: 'o', cell }] };`
		},
		__end__: {
			desc: 'The graph stopped — either the game ended or it’s your turn again.',
			explain: {
				lead: 'Back to you.',
				body: 'The conditional edge sent the run to END. Either someone won (or it’s a draw), or ◯ has moved and it’s your turn — so the graph hands control back to the board and waits for your next click.'
			}
		}
	};

	const EDGE_DETAIL: Record<string, EdgeDetail> = {
		'referee|scan_win': {
			title: 'Conditional edge · play',
			variant: 'router',
			desc: 'When the game continues and it’s ◯’s turn, the router returns the ARRAY ["scan_win", "scan_block"] — so both scans run in the same super-step.',
			code: routerCode
		},
		'referee|scan_block': {
			title: 'Conditional edge · play',
			variant: 'router',
			desc: 'The second half of the parallel branch. Returning an array of node names is how one conditional edge fans out into several nodes at once.',
			code: routerCode
		},
		'referee|__end__': {
			title: 'Conditional edge · done',
			variant: 'router',
			desc: 'The other outcome of the same router: the game is over (win/draw), OR ◯ has already moved and it’s your turn — either way the run halts. The number of turns is unknown up front, so only a function reading state can decide this — a static edge can’t.',
			code: routerCode
		},
		'scan_win|decide': {
			title: 'Fan-in',
			variant: '',
			desc: 'A plain edge. decide runs once, only after BOTH scans finish — the runtime joins the parallel branches for you.',
			code: `.addEdge('scan_win', 'decide')`
		},
		'scan_block|decide': {
			title: 'Fan-in',
			variant: '',
			desc: 'The matching join from the other scan. Two edges into decide means “wait for both, then run once”.',
			code: `.addEdge('scan_block', 'decide')`
		},
		'decide|referee': {
			title: 'Loop back',
			variant: '',
			desc: 'After ◯ moves, control returns to the referee to judge the new board. This back-edge is what lets one graph play any number of turns.',
			code: `.addEdge('decide', 'referee')`
		}
	};

	// ── Game + live frames ───────────────────────────────────────────────────────
	let board = $state<Board>(emptyBoard());
	let frames = $state<{ node: string; snap: GameSnapshot }[]>([]);
	let frameIdx = $state(0);
	let running = $state(false);
	let error = $state('');
	let threadCounter = 0;
	let graphPromise: ReturnType<typeof buildGameGraph> | null = null;

	const final = $derived<GameSnapshot | null>(frames.length ? frames[frames.length - 1].snap : null);
	const status = $derived<Status>(
		winner(board) ?? (emptyCells(board).length === 0 ? 'draw' : 'continue')
	);
	const aiCell = $derived(final?.aiMove ?? -1);
	const aiRationale = $derived(final?.moves.at(-1)?.rationale ?? '');
	const statusText = $derived(
		status === 'x'
			? 'You win — ✕ takes the line! 🎉'
			: status === 'o'
				? '◯ wins this one.'
				: status === 'draw'
					? 'Draw — the board is full.'
					: running
						? '◯ is thinking…'
						: 'Your move — you’re ✕.'
	);

	const STEP_MS = 460;
	async function pushFrame(node: string, s: GameSnapshot) {
		frames = [...frames, { node, snap: s }];
		frameIdx = frames.length - 1;
		await new Promise((r) => setTimeout(r, STEP_MS));
	}

	async function play(i: number) {
		if (running || status !== 'continue' || board[i] !== '' || turnOf(board) !== 'x') return;
		const next = board.slice();
		next[i] = 'x';
		board = next;
		frames = [];
		frameIdx = 0;
		error = '';
		running = true;
		try {
			graphPromise ??= buildGameGraph();
			const graph = await graphPromise;
			const r = await runGameTurn(
				graph,
				board,
				{ configurable: { thread_id: `ttt-${threadCounter++}` } },
				pushFrame
			);
			board = r.snapshot.board;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	function reset() {
		if (running) return;
		board = emptyBoard();
		frames = [];
		frameIdx = 0;
		error = '';
	}

	// ── What <LiveGraph> needs: per-step "what happened" + the State-tab object ──
	const glyph = (c: string) => (c === 'x' ? '✕' : c === 'o' ? '◯' : '·');
	function boardRows(b: Board): string[] {
		const g = b.map(glyph);
		return [g.slice(0, 3).join(' '), g.slice(3, 6).join(' '), g.slice(6, 9).join(' ')];
	}

	function describe(node: string, s: GameSnapshot, _prev: unknown, _count: number): StepInfo | null {
		switch (node) {
			case '__start__':
				return {
					summary: 'Your ✕ goes onto the board — that board is the graph’s state',
					stateChange: 'board = your move applied'
				};
			case 'referee': {
				if (s.status === 'continue') {
					const t = turnOf(s.board);
					return {
						summary: t === 'o' ? 'Game continues — ◯ to move' : 'Game continues — your turn',
						stateChange: "status = 'continue'",
						insight:
							t === 'o'
								? 'The conditional edge will fan out to the two scans.'
								: '◯ has moved, so the edge routes to END and hands control back to you.'
					};
				}
				return {
					summary:
						s.status === 'draw'
							? 'Board full — it’s a draw'
							: `${glyph(s.status)} completed a line — game over`,
					stateChange: `status = '${s.status}'`,
					insight: 'A terminal status, so the conditional edge routes straight to END.'
				};
			}
			case 'scan_win': {
				const n = s.analysis.find((a) => a.kind === 'win');
				return {
					summary: n?.found ? `Found a winning square for ◯ at ${n.cell}` : 'No immediate win for ◯',
					items: [{ icon: '⚙', text: 'scan_win', detail: n?.found ? `cell ${n.cell}` : 'none' }],
					stateChange: 'analysis += { kind: "win", … }',
					insight: 'Runs in the same super-step as scan_block.'
				};
			}
			case 'scan_block': {
				const n = s.analysis.find((a) => a.kind === 'block');
				return {
					summary: n?.found ? `✕ threatens to win at ${n.cell} — block it` : 'No ✕ threat to block',
					items: [{ icon: '⚙', text: 'scan_block', detail: n?.found ? `cell ${n.cell}` : 'none' }],
					stateChange: 'analysis += { kind: "block", … }',
					insight: 'Both scans wrote analysis at once — the concat reducer kept both.'
				};
			}
			case 'decide': {
				const m = s.moves.at(-1);
				return {
					summary: m ? `◯ plays cell ${m.cell}` : '◯ moves',
					items: m?.rationale ? [{ icon: '◯', text: m.rationale }] : undefined,
					stateChange: 'board updated · moves += { mark: "o", … }',
					insight: 'Then it loops back to the referee to judge the new board.'
				};
			}
			case '__end__':
				return {
					summary:
						s.status === 'continue' ? 'Your turn — the graph waits for your next click' : 'The game is over'
				};
			default:
				return null;
		}
	}
	function toState(s: GameSnapshot): Record<string, unknown> {
		return {
			board: boardRows(s.board),
			status: s.status,
			turn: turnOf(s.board) === 'x' ? '✕ (you)' : '◯ (graph)',
			analysis: s.analysis.map((a) => ({ kind: a.kind, cell: a.cell, found: a.found })),
			moves: s.moves.map((m) => ({ mark: glyph(m.mark), cell: m.cell }))
		};
	}

	// ── Narrative code excerpts ───────────────────────────────────────────────────
	const schemaCode = `const GameState = Annotation.Root({
  board:    Annotation<Board>({ reducer: (_, b) => b, default: emptyBoard }),         // last-write-wins
  moves:    Annotation<Move[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }), // append
  // scan_win & scan_block write this in the SAME super-step — concat or it throws:
  analysis: Annotation<ScanNote[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  status:   Annotation<Status>({ reducer: (_, b) => b, default: () => 'continue' })
});`;
</script>

<Lesson
	title="Conditional edges & reducers"
	eyebrow="Level 2 · Lesson 02"
	hero={{
		id: 'l2-conditional-edges',
		alt: 'A railway switch viewed from above with two tracks merging into one'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		The model produces a signal; the <Term t="Graph">graph</Term> decides what to do with it.
		<Term t="Conditional edge">Conditional edges</Term> are where that decision becomes code you can
		read — and <Term t="Reducer">reducers</Term> are how two <Term t="Node">nodes</Term> writing at
		once stay sane.
	{/snippet}
	{#snippet intro()}
		<p>
			A <Term t="StateGraph" /> is a router and a merge strategy in one. To make both concrete, the
			demo on the right is a game of <strong>tic-tac-toe</strong>: you play&nbsp;✕, the graph plays&nbsp;◯.
			After every move a <code>referee</code> <Term t="Node">node</Term> checks the board and a
			<Term t="Conditional edge">conditional edge</Term> decides what happens next — and when ◯ thinks,
			two checks run at once and merge through a <Term t="Reducer">reducer</Term>.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Routing is the part you can read" variant="dropcap">
			<p>
				Ask a model to "decide whether the game is over" inside a prompt and you're trusting a
				sentence. Move that decision into a <Term t="Conditional edge">conditional edge</Term> and it
				becomes a function your colleagues can read, your tests can hit, and your monitoring can count.
				The model's job shrinks to <em>producing a signal</em>; the graph decides what to do with it.
			</p>
			<p>
				A game makes the need obvious. You don't know how many turns it will take — that depends on how
				the moves fall. "Keep playing until someone wins or the board fills, otherwise wait for the
				human" is impossible to wire with <Term t="Edge">static edges</Term>; only a router that reads
				the live <Term t="State">state</Term> can express it. <strong>That</strong> is when a
				conditional edge stops being convenient and becomes required.
			</p>
		</Slide>

		<Slide title="The conditional edge" variant="code-first">
			<p>
				<Term t="addConditionalEdges"><code>addConditionalEdges('source', router, mapping)</code></Term>
				calls your <Term t="Router">router</Term> with the current <Term t="State" /> and uses what it
				returns to pick the next <Term t="Node" />. Return a string for one destination,
				<code>END</code> to stop, or an <strong>array of names to run several at once</strong>.
			</p>
			<CodeBlock code={routerCode} caption="One edge, three outcomes — stop, or fan out to both scans." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="conditional-edges-router"
				alt="A brass railway-switch: the referee node feeds a lever (the router) that reads STATE and throws the track to one of three destinations — END, or a pair of parallel scan nodes."
			/>
			<figcaption>
				The router reads state and throws the switch: stop, or send the run down one or more tracks.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				The model produces signal. The graph produces structure. Conditional edges are where the two
				meet — and where most production agent bugs are caught.
			</p>
		</Slide>

		<Slide title="Why reducers exist" variant="code-first">
			<p>
				When ◯ thinks, the router returns <em>two</em> node names, so <code>scan_win</code> and
				<code>scan_block</code> run in the same <Term t="Superstep">super-step</Term> and both write
				<code>analysis</code>. Two writes to one field in one step is ambiguous — LangGraph refuses it
				with <code>INVALID_CONCURRENT_GRAPH_UPDATE</code> rather than silently dropping one. A
				<Term t="Reducer">reducer</Term> tells the runtime how to combine them.
			</p>
			<CodeBlock code={schemaCode} caption="Three reducer styles in one schema — concat, append, last-write-wins." />
			<p>
				The same append reducer powers <Term t="MessagesAnnotation"><code>MessagesAnnotation</code></Term>
				from lesson 01 — <code>messages</code> is just a list with a built-in concat.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="conditional-edges-reducers"
				alt="Two nodes pour into one channel through a brass merging-manifold, labelled with three reducer styles — concat, append, and last-write-wins."
			/>
			<figcaption>
				A reducer is the rule for merging writes to one field — so concurrent nodes never clobber.
			</figcaption>
		</figure>

		<Slide title="Play a round">
			<p>
				Click any square to play ✕. Your move runs the graph once, and the live view lights up the path:
				<code>referee → scan_win ∥ scan_block → decide → referee → END</code>. Win the game and watch the
				very first <code>referee</code> route <em>straight</em> to <code>END</code> — the AI is skipped,
				because the conditional edge saw the game was already over. <strong>Hover any node or labelled
				edge</strong> to see what it does, the exact state it wrote, and the source behind it.
			</p>
		</Slide>

		<Slide title="What this unlocks" ornament>
			<p>
				<Term t="Conditional edge">Conditional edges</Term> are the runtime surface for every
				router-style agent — triage, escalation, retry loops, and games like this one.
				<Term t="Reducer">Reducers</Term> are the substrate under every concurrent-writer pattern in the
				rest of this chapter, including <Term t="Fan-out">fan-out</Term> and
				<Term t="Map-reduce">map-reduce</Term> in later lessons.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Conditional edges (addConditionalEdges)', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/branching/', kind: 'docs' },
				{ label: 'Define state & reducers', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/define-state/', kind: 'docs' },
				{ label: 'Low-level concepts — channels & reducers', href: 'https://langchain-ai.github.io/langgraphjs/concepts/low_level/', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="every click is one run of the graph">
			<ol class="howto">
				<li><strong>Play a square.</strong> You're ✕ and move first — each click hands the board to the graph and runs it once, so ◯ replies and the status line tells you whose turn it is.</li>
				<li><strong>Watch the path light up.</strong> The live graph traces <code>referee → scan_win ∥ scan_block → decide → referee → END</code>. Hover any node or labelled edge to see what it did and the state it wrote.</li>
				<li><strong>Win, and watch the shortcut.</strong> Complete a line and the very first <code>referee</code> routes <em>straight</em> to <code>END</code> — the conditional edge sees the game is over and skips ◯ entirely. Hit <em>New game</em> to retry.</li>
			</ol>
		</Panel>

		<Panel title="Tic-tac-toe vs. the graph" subtitle="you’re ✕ and move first — every click runs the graph once">
			<div class="board" class:locked={running || status !== 'continue'}>
				{#each board as cell, i (i)}
					<button
						class="cell"
						class:ai={i === aiCell}
						class:x={cell === 'x'}
						class:o={cell === 'o'}
						disabled={running || cell !== '' || status !== 'continue'}
						onclick={() => play(i)}
						aria-label={`cell ${i}${cell ? ` (${cell === 'x' ? 'you' : 'graph'})` : ''}`}
					>
						{glyph(cell)}
					</button>
				{/each}
			</div>
			<div class="status" data-s={status}>{statusText}</div>
			{#if aiRationale}<p class="rationale">◯ {aiRationale}</p>{/if}
			<button class="newgame" onclick={reset} disabled={running}>New game</button>
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if frames.length}
			<Panel title="The graph, live" subtitle="hover any node or labelled edge to inspect what it does">
				<LiveGraph
					nodes={graphNodes}
					edges={graphEdges}
					{frames}
					bind:frameIdx
					meta={nodeMeta}
					edgeDetails={EDGE_DETAIL}
					{describe}
					{toState}
				/>
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
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

	/* In-narrative diagrams: frameless, full column width. */
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

	/* Tic-tac-toe board */
	.board {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		width: min(100%, 280px);
		margin: 0 auto 0.85rem;
		aspect-ratio: 1;
	}
	.cell {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: clamp(1.8rem, 8vw, 2.6rem);
		line-height: 1;
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-fg);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, transform 0.05s;
	}
	.cell:not(:disabled):hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--color-bg));
	}
	.cell:not(:disabled):active {
		transform: scale(0.96);
	}
	.cell:disabled {
		cursor: default;
	}
	.cell.x {
		color: var(--color-fg);
	}
	.cell.o {
		color: var(--accent);
	}
	.cell.ai {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.board.locked .cell {
		cursor: default;
	}

	.status {
		text-align: center;
		font-size: 0.92rem;
		font-weight: 500;
		color: var(--color-fg);
		margin-bottom: 0.4rem;
	}
	.status[data-s='x'] {
		color: var(--accent);
	}
	.rationale {
		margin: 0 0 0.7rem;
		text-align: center;
		font-size: 0.82rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}
	.newgame {
		display: block;
		margin: 0 auto;
		padding: 0.4rem 0.9rem;
		font-size: 0.8rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		color: var(--color-fg);
		cursor: pointer;
	}
	.newgame:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.newgame:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.err {
		margin-top: 0.6rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}
</style>
