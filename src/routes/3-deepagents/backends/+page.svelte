<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import SkyChart from '$lib/components/SkyChart.svelte';
	import { totalMessageTokens } from '$lib/deepagents/tokens';
	import type { BaseMessage } from '@langchain/core/messages';
	import { browser } from '$app/environment';
	import type { VirtualFile, DeepAgentStateType } from '$lib/deepagents';
	import {
		buildObservatory,
		peekAtlas,
		peekLogbook,
		resetAtlas,
		CHART_PATH,
		type Observatory,
		type Chart,
		type SkyRegion
	} from '$lib/demos/da-backends';
	import observatorySrc from '$lib/demos/da-backends.ts?raw';
	import backendsSkill from '$lib/demos/skills/deepagents-backends.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Moon, Flame } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'da-backends',
		title: 'Backends — The Observatory',
		summary:
			'One agent, one workspace, two shelves: /atlas/** routes to a durable StoreBackend (the star atlas survives new threads and page reloads), /scratch/** lives in thread state and burns off at dawn. CompositeBackend does the routing; the agent never knows the difference.',
		entries: [{ path: 'lib/demos/da-backends.ts', code: observatorySrc }],
		runner: `import { buildObservatory, resetAtlas } from './lib/demos/da-backends';

await resetAtlas(); // Node runs start fresh (in the browser, the atlas persists)
const obs = await buildObservatory({
	onChart: (c) => console.log('  · atlas:', c.charted.map((e) => e.region).join(', ') || '(empty)')
});

console.log('NIGHT', obs.night);
const state = await obs.observe("Chart the brightest things in tonight's sky.");
console.log('\\n' + obs.finalText(state));
console.log('\\nLOGBOOK:\\n' + ((await obs.readFile('/atlas/logbook.md')) ?? '(none)'));

const next = await obs.closeDome();
console.log('\\nDome closed. /scratch burned off; /atlas endures. Night ' + next + ' awaits.');`,
		skill: backendsSkill
	};

	// ── Run state ───────────────────────────────────────────────────────────────
	type Phase = 'closed' | 'observing' | 'open' | 'dawn' | 'error';
	let phase = $state<Phase>('closed');
	let busy = $state(false);
	let error = $state('');
	let commission = $state('');

	let observatory: Observatory | null = null;
	let chart = $state<Chart>({ night: 1, charted: [] });
	let surveyed = $state<string[]>([]);
	let files = $state<VirtualFile[]>([]);
	let msgs = $state<BaseMessage[]>([]);
	let logbook = $state('');
	let finalWord = $state('');
	let contextTokens = $state(0);
	let compactions = $state(0);
	let dawnLost = $state<string[]>([]);
	let dawnKept = $state<string[]>([]);

	let selected = $state<{ region: SkyRegion; night: number | null } | null>(null);
	let skyMode = $state<'flat' | 'sphere'>('flat');

	const phaseLabel = $derived(
		phase === 'closed'
			? `night ${chart.night} — the dome is closed; commission an observation`
			: phase === 'observing'
				? 'the keeper is at the eyepiece…'
				: phase === 'open'
					? `night ${chart.night} — observe again, or close up`
					: phase === 'dawn'
						? 'dawn — see what survived, then open a new night'
						: 'something broke (see below)'
	);

	// First paint: the atlas is durable, so it may already exist. No agent needed.
	$effect(() => {
		if (!browser) return;
		(async () => {
			chart = await peekAtlas();
			logbook = (await peekLogbook()) ?? '';
		})();
	});

	const hooks = {
		onState: (s: DeepAgentStateType) => {
			files = [...s.files];
			msgs = [...(s.messages as BaseMessage[])];
			compactions = s.summarizationEvents.length;
			contextTokens = totalMessageTokens(s.messages as BaseMessage[]);
			const log = s.files.find((f) => f.path === '/atlas/logbook.md');
			if (log) logbook = log.content;
		},
		onChart: (c: Chart) => (chart = c),
		onSurvey: (id: string) => {
			if (!surveyed.includes(id)) surveyed = [...surveyed, id];
		}
	};

	async function observe(text?: string) {
		const ask = (text ?? commission).trim();
		if (busy || !ask) return;
		busy = true;
		phase = 'observing';
		error = '';
		finalWord = '';
		dawnLost = [];
		dawnKept = [];
		try {
			if (!observatory) observatory = await buildObservatory(hooks);
			const state = await observatory.observe(ask);
			finalWord = observatory.finalText(state);
			commission = '';
			phase = 'open';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function closeDome() {
		if (busy || !observatory) return;
		busy = true;
		try {
			// The dawn report: judged by backend, not by promise.
			dawnLost = files.filter((f) => f.backend === 'state').map((f) => f.path);
			dawnKept = files.filter((f) => f.backend === 'store').map((f) => f.path);
			await observatory.closeDome();
			observatory = null;
			chart = await peekAtlas();
			surveyed = [];
			msgs = [];
			files = [];
			finalWord = '';
			contextTokens = 0;
			compactions = 0;
			phase = 'dawn';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function burnAtlas() {
		if (busy) return;
		busy = true;
		try {
			await resetAtlas();
			observatory = null;
			chart = await peekAtlas();
			logbook = '';
			surveyed = [];
			msgs = [];
			files = [];
			finalWord = '';
			dawnLost = [];
			dawnKept = [];
			selected = null;
			phase = 'closed';
		} finally {
			busy = false;
		}
	}

	const starters = [
		"Chart the brightest things in tonight's sky",
		'Begin the Summer Triangle — Lyra first, if she is up',
		'Survey everything visible and engrave the two best',
		"Keeper's choice — continue the atlas"
	];

	const chartedEntry = $derived(
		selected ? chart.charted.find((e) => e.region === selected!.region.id) : undefined
	);

	// ── Narrative code ───────────────────────────────────────────────────────────
	const compositeCode = `const backend = new CompositeBackend(
  [{ prefix: '/atlas/', backend: new StoreBackend('observatory-atlas') }],
  new StateBackend()                        // ← the default route
);

// One workspace, two destinies — the agent calls the SAME tools either way:
//   write_file('/atlas/chart.json', …)    → IndexedDB    — survives reload
//   write_file('/scratch/eyepiece.md', …) → thread state — burns off at dawn
//
// Longest prefix wins ('/atlas/deep/' would shadow '/atlas/'), and the
// default route also receives the harness's own files (offloaded outputs).`;

	const rosterCode = `// The official shelf list — the same six tools stand in front of all of them:
//   StateBackend        thread-scoped; lives inside the checkpoints   (default)
//   StoreBackend        durable BaseStore; namespaced per user / assistant
//   FilesystemBackend   a real directory; virtualMode jails '..' escapes
//   LocalShellBackend   filesystem + execute() — no sandbox, gate it with HITL
//   ContextHubBackend   every write becomes a versioned LangSmith Hub commit
//   Modal · Daytona · Runloop · Deno · LangSmith — sandboxes: isolated disk + execute()
//   …or implement BackendProtocolV2 yourself: ls / read / readRaw / grep / glob / write / edit`;
</script>

<Lesson
	title="Backends"
	eyebrow="Level 3 · Lesson 04 · Where files live"
	hero={{
		id: 'l3-backends',
		alt: 'A Victorian observatory: a brass telescope aims through the dome slit; below, a glowing star atlas on a pedestal and a chalk slate dissolving into vapor'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		The six filesystem tools are a contract; the <Term t="Backend">backend</Term> is a choice. An
		agent remembers exactly as long as its storage does — swap the backend and the same agent
		becomes ephemeral, durable, versioned, or sandboxed, without touching a line of its code.
	{/snippet}
	{#snippet intro()}
		<p>
			The demo is <strong>The Observatory</strong>: an astronomer agent mapping a fixed sky, night
			by night. Its workspace has two shelves — <code>/atlas/**</code> routes to a durable
			<Term t="StoreBackend">store</Term> (<Term t="IndexedDB">IndexedDB</Term>), everything else
			to thread <Term t="StateBackend">state</Term> — via one
			<Term t="CompositeBackend">composite</Term> router. Close the dome and reopen it: a fresh
			agent with no memory of the conversation… and a star atlas that
			<strong>survives anything</strong>, including a page reload.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why backends" title="The tools are a contract. The storage is a choice." variant="dropcap">
			<p>
				Everything the last two lessons taught — <code>write_file</code>, <code>grep</code>, plans
				and diagnoses in <code>/notes/</code> — happened against the <em>default</em> backend,
				where files live inside the thread's <Term t="Checkpoint">checkpoints</Term>. That gives
				files exactly the thread's lifetime: perfect isolation, zero ceremony, and total amnesia
				the moment you start a new conversation. Sometimes that's a bug. Often it's precisely the
				point — a scratch buffer that <em>outlived</em> the job would leak one task's confusion
				into the next.
			</p>
			<p>
				The deep-agents answer is to make lifetime a <strong>routing decision</strong>. Every
				filesystem tool talks to a <Term t="BackendProtocol"><code>BackendProtocol</code></Term> —
				and what stands behind that protocol is configuration:
			</p>
			<CodeBlock code={rosterCode} caption="One contract, many shelves — from RAM to vaults to sandboxes." />
			<p class="aside">
				Two production details worth knowing now: <Term t="StoreBackend">StoreBackend</Term>
				namespaces its files with a factory — per-user, per-assistant, per-thread — so one
				deployment serves a thousand users a thousand private memories; and
				<code>ContextHubBackend</code> turns every write into a commit, so an agent's files carry
				their whole version history. Our glass-box build implements the same protocol over
				<Term t="Dexie">Dexie</Term>/<Term t="IndexedDB">IndexedDB</Term> — the browser's honest
				stand-in for a Postgres-backed store.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-backends-shelves"
				alt="An infographic poster: a routing funnel labeled ROUTED BY PATH dispatches scrolls into five cabinet compartments — state (evaporating tray), store (iron vault), filesystem (wooden drawers), sandbox (caged workbench), context hub (ledger with version ribbons)."
			/>
			<figcaption>
				The cabinet: one funnel, five shelves. The path decides the destiny — the agent just
				writes files.
			</figcaption>
		</figure>

		<Slide title="One workspace, many shelves" variant="code-first">
			<p>
				<Term t="CompositeBackend">CompositeBackend</Term> is how you mix lifetimes without
				teaching the agent about storage: mount a durable store on a path prefix, let everything
				else fall through to state. The agent sees one workspace; <code>ls</code> aggregates
				across all routes; the <strong>longest matching prefix wins</strong>, so a deeper mount
				can shadow a shallower one.
			</p>
			<CodeBlock code={compositeCode} caption="Routing by path: the prefix is the policy." />
			<p>
				In the demo, the keeper's prompt never says "IndexedDB" — it says
				<em>"/atlas/ is the permanent record; /scratch/ burns off at dawn."</em> The semantics
				live in one place (the router) and the behavior follows. One more guardrail from last
				lesson reappears: <code>{CHART_PATH}</code> is deny-write at the
				<Term t="Permissions">permission</Term> layer, so the atlas only changes through the
				<code>chart_constellation</code> instrument — never through a freehand
				<code>write_file</code>.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-backends-dawn"
				alt="An infographic poster in two panels: at sunrise, eyepiece scribbles burn off into vapor (SCRATCH — gone at dawn); beside it, a star atlas rests intact in an iron vault (THE ATLAS — endures)."
			/>
			<figcaption>
				The dawn report, as allegory: what was promised to the thread dies with the thread; what
				was routed to the store is still there tomorrow.
			</figcaption>
		</figure>

		<Slide title="Dawn is a feature" ornament>
			<p>
				It's tempting to treat persistence as an upgrade and ephemerality as a limitation. The
				harness treats them as <em>different tools</em>. Thread-scoped state gives every job a
				clean bench: nothing left over, nothing leaking forward, every run reproducible from its
				<Term t="Checkpoint">checkpoints</Term>. Durable storage is the deliberate exception — a
				small, well-chosen set of paths that the <em>next</em> agent, with no memory of this
				conversation, will rely on. The Observatory's keeper writes its logbook for a successor
				it will never meet. That's the design stance: <strong>memory is not a property of the
				model. It's a property of the storage you hand it.</strong>
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>An agent remembers exactly as long as its backend does.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Backends — all seven types & BackendProtocolV2',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/backends',
					kind: 'docs'
				},
				{
					label: 'Sandboxes — Modal, Daytona, Runloop, Deno, LangSmith',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/sandboxes',
					kind: 'docs'
				},
				{
					label: 'Going to production — stores & deployment',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/going-to-production',
					kind: 'docs'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents',
					kind: 'api'
				},
				{
					label: 'Star data — d3-celestial (Hipparcos/HYG, BSD)',
					href: 'https://github.com/ofrohn/d3-celestial',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="map the sky across nights — and try to lose the atlas">
			<ol class="howto">
				<li>
					<strong>Commission a night.</strong> The keeper consults the almanac, surveys, keeps
					eyepiece notes in <code>/scratch</code>, and engraves at most two constellations into
					the atlas.
				</li>
				<li>
					<strong>Close up for the night.</strong> The thread ends: scratch burns off, the atlas
					and logbook survive. Then — really — <strong>reload the page.</strong> Still there.
				</li>
				<li>
					<strong>Keep going.</strong> Each night a different slice of sky is visible. Click any
					constellation to see where it lives and which backend holds it.
				</li>
			</ol>
		</Panel>

		<Panel title="The dome" subtitle={phaseLabel}>
			{#snippet actions()}
				<span class="mode-toggle">
					<button class:on={skyMode === 'flat'} onclick={() => (skyMode = 'flat')}>atlas</button>
					<button class:on={skyMode === 'sphere'} onclick={() => (skyMode = 'sphere')}>sphere</button>
				</span>
				<span class="night-badge"><Moon size={12} /> night {chart.night}</span>
			{/snippet}
			<p class="what">
				This map <em>is</em> the file <code>/atlas/chart.json</code>, rendered. The dim stars are
				the real sky (Hipparcos positions — the agent's tools can see them); a constellation
				lights up only once the keeper engraves it into the durable atlas. Between nights the
				agent remembers <strong>nothing</strong> — only what's on this map and in the logbook.
			</p>
			<SkyChart
				{chart}
				{surveyed}
				selected={selected?.region.id ?? null}
				mode={skyMode}
				onselect={(region, night) => (selected = { region, night })}
			/>
			<div class="legend">
				<span><i class="dot bg"></i> the sky — not yet in the atlas</span>
				<span><i class="dot lit"></i> engraved in /atlas/chart.json</span>
				<span><i class="dash"></i> surveyed tonight</span>
				{#if skyMode === 'sphere'}<span class="drag-hint">drag the globe to turn it</span>{/if}
			</div>
			{#if selected}
				<div class="inspect">
					<div class="inspect-head">
						<strong>{selected.region.name}</strong>
						{#if chartedEntry}
							<span class="tag store">charted night {chartedEntry.night} · /atlas/chart.json · store</span>
						{:else}
							<span class="tag">uncharted — exists only in the sky (the catalog)</span>
						{/if}
					</div>
					<p class="lore">{selected.region.lore}</p>
					{#if chartedEntry}
						<pre class="entry">{JSON.stringify(chartedEntry, null, 2)} <!-- from {CHART_PATH} — survives dawn AND reloads --></pre>
					{:else}
						<p class="lore faint">
							{selected.region.stars.length} stars wait in the dark. Commission a survey — if it's
							visible tonight.
						</p>
					{/if}
				</div>
			{/if}

			<label class="prompt">
				<span>Tonight's commission…</span>
				<input
					type="text"
					bind:value={commission}
					disabled={busy}
					placeholder="e.g. chart the Queen's W if she's up"
					onkeydown={(e) => {
						if (e.key === 'Enter') observe();
					}}
				/>
			</label>
			<div class="starters">
				{#each starters as s (s)}
					<button class="starter" onclick={() => observe(s)} disabled={busy}>{s}</button>
				{/each}
			</div>
			<div class="controls">
				<RunButton
					onclick={() => observe()}
					running={busy}
					label={phase === 'open' ? 'Observe again' : 'Open the dome & observe'}
				/>
				{#if phase === 'open'}
					<button class="ghost" onclick={closeDome} disabled={busy}>
						<Moon size={13} /> Close up for the night
					</button>
				{/if}
				<button class="ghost burn" onclick={burnAtlas} disabled={busy} title="clear the IndexedDB scope — a brand-new atlas">
					<Flame size={13} /> burn the atlas
				</button>
			</div>
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if phase === 'dawn'}
			<Panel title="The dawn report" subtitle="judged by backend, not by promise">
				<div class="dawn">
					<div class="col">
						<h5>burned off with the thread <span class="tag">state</span></h5>
						{#if dawnLost.length}
							<ul>
								{#each dawnLost as p (p)}<li class="lost">{p}</li>{/each}
							</ul>
						{:else}
							<p class="none">nothing was left on the bench</p>
						{/if}
					</div>
					<div class="col">
						<h5>endured <span class="tag store">store</span></h5>
						<ul>
							{#each dawnKept as p (p)}<li class="kept">{p}</li>{/each}
						</ul>
					</div>
				</div>
				<p class="dare">
					Don't take the demo's word for it — <strong>reload the page</strong>. The atlas above
					will still be lit, night number and all. The feed, the scratch notes, this very report:
					gone. IndexedDB doesn't care about your tab.
				</p>
			</Panel>
		{/if}

		{#if msgs.length}
			<Panel title="The night's work" subtitle="the run itself — every word, tool call, and result, live">
				{#snippet actions()}
					<span class="meter" title="estimated tokens currently in the agent's context">
						ctx ≈ {contextTokens.toLocaleString()} tok{compactions
							? ` · ${compactions} compaction${compactions === 1 ? '' : 's'}`
							: ''}
					</span>
				{/snippet}
				<AgentFeed messages={msgs} />
				{#if finalWord}
					<div class="final"><Markdown source={finalWord} /></div>
				{/if}
			</Panel>
		{/if}

		{#if files.length}
			<Panel title="The two shelves" subtitle="one workspace — the badge tells you the destiny">
				<FileTreeViewer {files} title="" />
			</Panel>
		{/if}

		{#if logbook}
			<Panel title="The logbook" subtitle="/atlas/logbook.md — written by keepers who never met">
				<div class="note"><Markdown source={logbook} /></div>
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

	.night-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
	.mode-toggle {
		display: inline-flex;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		overflow: hidden;
		margin-right: 0.45rem;
	}
	.mode-toggle button {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		padding: 0.12rem 0.55rem;
		background: transparent;
		color: var(--color-fg-faint);
		border: none;
		cursor: pointer;
	}
	.mode-toggle button.on {
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		color: var(--accent-ink);
	}
	.what {
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
	}
	.what strong {
		color: var(--color-fg);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 0.45rem;
		font-size: 0.68rem;
		font-family: var(--font-mono);
		color: var(--color-fg-faint);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
	}
	.dot {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		display: inline-block;
	}
	.dot.bg {
		background: #aab3cf;
		opacity: 0.45;
	}
	.dot.lit {
		background: color-mix(in oklch, var(--accent) 35%, #f4f1ff);
		box-shadow: 0 0 4px var(--accent);
	}
	.dash {
		width: 0.9rem;
		height: 0;
		border-top: 1px dashed #b08d57;
		display: inline-block;
	}
	.drag-hint {
		font-style: italic;
	}

	/* Inspector */
	.inspect {
		margin-top: 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-paper);
		padding: 0.55rem 0.7rem;
	}
	.inspect-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.84rem;
		color: var(--color-fg);
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--color-fg-faint);
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
	}
	.tag.store {
		color: var(--accent-ink);
		border-color: var(--accent-rule);
	}
	.lore {
		margin: 0.35rem 0 0;
		font-size: 0.78rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}
	.lore.faint {
		color: var(--color-fg-faint);
	}
	.entry {
		margin: 0.45rem 0 0;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--color-fg-muted);
	}

	/* Commission */
	.prompt {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0.7rem 0 0.55rem;
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
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.42rem 0.7rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		cursor: pointer;
	}
	.ghost:hover:not(:disabled) {
		color: var(--color-fg);
		border-color: var(--accent);
	}
	.ghost.burn:hover:not(:disabled) {
		color: var(--color-accent-warning);
		border-color: var(--color-accent-warning);
	}
	.err {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}

	/* Dawn report */
	.dawn {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	@media (max-width: 600px) {
		.dawn {
			grid-template-columns: 1fr;
		}
	}
	.col {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-paper);
		padding: 0.55rem 0.7rem;
	}
	.col h5 {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		margin: 0 0 0.4rem;
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--color-fg-muted);
	}
	.col ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.col li {
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.col li.lost {
		color: var(--color-fg-faint);
		text-decoration: line-through;
	}
	.col li.kept {
		color: var(--accent-ink);
	}
	.none {
		margin: 0;
		font-size: 0.74rem;
		font-style: italic;
		color: var(--color-fg-faint);
	}
	.dare {
		margin: 0.7rem 0 0;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.dare strong {
		color: var(--color-fg);
	}

	/* Final word + logbook */
	.final {
		margin-top: 0.6rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.note {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-paper);
		padding: 0.6rem 0.75rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.note :global(p),
	.final :global(p) {
		margin: 0 0 0.4rem;
		line-height: 1.55;
	}
	.note :global(p:last-child),
	.final :global(p:last-child) {
		margin-bottom: 0;
	}
	.note :global(ul),
	.note :global(ol),
	.final :global(ul),
	.final :global(ol) {
		margin: 0 0 0.4rem;
		padding-left: 1.2rem;
	}
	.note :global(h1),
	.note :global(h2),
	.note :global(h3),
	.final :global(h1),
	.final :global(h2),
	.final :global(h3) {
		font-size: 0.9rem;
		margin: 0.5rem 0 0.3rem;
		color: var(--color-fg);
	}
	.note :global(code),
	.final :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.meter {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
</style>
