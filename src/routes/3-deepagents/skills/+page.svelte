<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import type { BaseMessage } from '@langchain/core/messages';
	import type { CompiledDeepAgent } from '$lib/deepagents';
	import {
		CLERKS,
		buildClerk,
		CUSTOMER_REQUEST,
		FOLLOW_UP,
		SKILL_FILES,
		SKILL_NAMES,
		EXPECTED,
		inspectRefundReply,
		inspectDeletionReply,
		skillPayloadTokens,
		type ClerkVariant,
		type Verdict
	} from '$lib/demos/da-skills';
	import skillsSrc from '$lib/demos/da-skills.ts?raw';
	import skillsSkill from '$lib/demos/skills/deepagents-skills.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-skills',
		title: 'Skills — the Support Desk',
		summary:
			'One refund request, three identical agents: no skills, all procedures crammed into the prompt, and a progressive-disclosure skill catalog. A deterministic inspector stamps each reply.',
		entries: [{ path: 'lib/demos/da-skills.ts', code: skillsSrc }],
		skill: skillsSkill,
		runner: `import { buildClerk, CUSTOMER_REQUEST, inspectRefundReply } from './lib/demos/da-skills';

for (const variant of ['bare', 'crammed', 'skilled'] as const) {
	const { agent } = await buildClerk(variant);
	const out = await agent.invoke({ input: CUSTOMER_REQUEST, thread: variant });
	const last = out.messages[out.messages.length - 1];
	const text = typeof last?.content === 'string' ? last.content : '';
	const verdict = inspectRefundReply(text);
	console.log('\\n[' + variant + '] ' + (verdict.pass ? 'PASS' : 'REJECTED'));
	for (const c of verdict.checks) console.log('  ' + (c.pass ? '✓' : '✗') + ' ' + c.label);
}
`
	};

	// ── Per-desk run state ─────────────────────────────────────────────────────
	interface RoundMeter {
		round: number;
		promptCore: number;
		catalog: number;
		chat: number;
		total: number;
	}
	interface DeskState {
		msgs: BaseMessage[];
		events: TraceEvent[];
		busy: boolean;
		error: string;
		verdicts: { turn: 1 | 2; v: Verdict }[];
	}
	const empty = (): DeskState => ({ msgs: [], events: [], busy: false, error: '', verdicts: [] });

	let desks = $state<Record<ClerkVariant, DeskState>>({
		bare: empty(),
		crammed: empty(),
		skilled: empty()
	});
	let busy = $state(false);
	let turnsDone = $state(0);
	const agents: Partial<Record<ClerkVariant, CompiledDeepAgent>> = {};
	const threads: Partial<Record<ClerkVariant, string>> = {};

	function finalTextOf(msgs: BaseMessage[]): string {
		const last = msgs[msgs.length - 1];
		return typeof last?.content === 'string' ? last.content : '';
	}

	async function askAll(input: string, turn: 1 | 2) {
		busy = true;
		await Promise.all(
			CLERKS.map(async ({ variant }) => {
				const desk = desks[variant];
				desk.busy = true;
				desk.error = '';
				try {
					if (turn === 1) {
						const tracer = createTracer();
						tracer.subscribe((ev) => {
							desks[variant].events = [...desks[variant].events, ev];
						});
						const { agent } = await buildClerk(variant, tracer);
						agents[variant] = agent;
						threads[variant] = `desk-${variant}-${Math.random().toString(36).slice(2, 7)}`;
						agent.subscribe((s) => (desks[variant].msgs = [...s.messages]));
					}
					const agent = agents[variant]!;
					const out = await agent.invoke({ input, thread: threads[variant] });
					desks[variant].msgs = [...out.messages];
					const text = finalTextOf(out.messages);
					const v = turn === 1 ? inspectRefundReply(text) : inspectDeletionReply(text);
					desk.verdicts = [...desk.verdicts, { turn, v }];
				} catch (e) {
					desk.error = e instanceof Error ? e.message : String(e);
				} finally {
					desk.busy = false;
				}
			})
		);
		turnsDone = turn;
		busy = false;
	}

	function reset() {
		desks = { bare: empty(), crammed: empty(), skilled: empty() };
		turnsDone = 0;
		for (const { variant } of CLERKS) {
			delete agents[variant];
			delete threads[variant];
		}
	}

	// ── Context meters, derived from the harness's model_call anatomy events ──
	function metersOf(desk: DeskState): RoundMeter[] {
		return desk.events
			.filter((e) => e.kind === 'model_call')
			.map((e) => {
				const d = e.data as {
					round: number;
					sections: { key: string; tokens: number }[];
					systemTokens: number;
					conversationTokens: number;
					totalTokens: number;
				};
				const catalog = d.sections.find((s) => s.key === 'skills')?.tokens ?? 0;
				return {
					round: d.round,
					promptCore: d.systemTokens - catalog,
					catalog,
					chat: d.conversationTokens,
					total: d.totalTokens
				};
			});
	}
	const meters = $derived({
		bare: metersOf(desks.bare),
		crammed: metersOf(desks.crammed),
		skilled: metersOf(desks.skilled)
	});
	const meterMax = $derived(
		Math.max(1, ...CLERKS.flatMap(({ variant }) => meters[variant].map((m) => m.total)))
	);
	const totalsRead = $derived({
		bare: meters.bare.reduce((t, m) => t + m.total, 0),
		crammed: meters.crammed.reduce((t, m) => t + m.total, 0),
		skilled: meters.skilled.reduce((t, m) => t + m.total, 0)
	});

	function loadedSkills(desk: DeskState): string[] {
		const names: string[] = [];
		for (const e of desk.events) {
			if (e.kind !== 'skill_load') continue;
			const name = e.label.split('/')[2];
			if (name && !names.includes(name)) names.push(name);
		}
		return names;
	}
	function scriptRuns(desk: DeskState): { label: string; ok: boolean }[] {
		return desk.events
			.filter((e) => e.kind === 'script_run')
			.map((e) => ({
				label: e.label.split('/').pop() ?? e.label,
				ok: (e.data as { ok?: boolean })?.ok ?? false
			}));
	}

	function fmtTok(n: number): string {
		return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
	}

	// ── The skill shelf ────────────────────────────────────────────────────────
	const shelf = SKILL_NAMES.map((name) => ({
		name,
		files: Object.keys(SKILL_FILES)
			.filter((p) => p.startsWith(`/skills/${name}/`))
			.map((p) => ({ path: p, label: p.split('/').slice(3).join('/') }))
	}));
	let selectedFile = $state('/skills/refund-policy/SKILL.md');

	// ── Code blocks ────────────────────────────────────────────────────────────
	const skillsCode = `// A skill is a DIRECTORY on the backend — not a prompt section.
/skills/refund-policy/SKILL.md             ← frontmatter + the procedure
/skills/refund-policy/scripts/prorate.js   ← deterministic money math
/skills/refund-policy/references/…         ← price table, required disclosures

const agent = createDeepAgent({
  model, backend,
  skills: ['/skills/'],     // source paths, scanned for <dir>/SKILL.md
});

// LEVEL 1 — the system prompt gains one line per skill:
//   - refund-policy: Compute and communicate refunds … (procedure: /skills/refund-policy/SKILL.md)
// LEVEL 2 — when a task matches, the agent read_file()s the manual.
// LEVEL 3 — the manual points at references/ and scripts/, fetched on demand.
// There is NO load_skill tool — the filesystem IS the disclosure mechanism.`;

	const frontmatterCode = `---
name: refund-policy            # must EXACTLY match the directory name
description: Compute and communicate refunds for Lumen Analytics
  cancellations. Use whenever a customer asks to cancel, requests a
  refund, or asks how much money comes back. …   # ≤ 1024 chars, keyword-rich
---

# Refund policy & cancellation procedure
## Never compute a refund by hand
ALWAYS run the script: run_script /skills/refund-policy/scripts/prorate.js …`;

	const scriptCode = `// The agent, after reading the manual (level 3 in action):
run_script({
  path: '/skills/refund-policy/scripts/prorate.js',
  input: '{"plan":"pro","interval":"annual",
           "purchaseDate":"2026-03-03","cancelDate":"2026-06-12"}'
})
// → { "refund": 277.67, "gross": 326.67, "fee": 49, "unusedMonths": 8, … }
//
// Officially scripts run in a sandbox backend, or as interpreter skills:
//   metadata.entrypoint: scripts/index.ts  →  await import("@/skills/refund-policy")
// run_script is this harness's browser stand-in for the same idea.`;

	const permissionsSnippet = `{ operations: ['write'], paths: ['/skills/**'], mode: 'deny' }`;
</script>

<Lesson
	title="Skills"
	eyebrow="Level 3 · Lesson 07 · The Support Desk"
	hero={{
		id: 'l3-skills',
		alt: 'Three clerks at one counter: a bare desk, a desk buried under five open manuals, and a desk with a card catalog and a single open manual'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		An agent's behavior is its <Term t="Context window">context</Term>. <Term t="Skill">Skills</Term> change behavior <em>without</em> spending context — one catalog line, until the moment the manual is actually needed. That trick has a name: <Term t="Progressive disclosure">progressive disclosure</Term>.
	{/snippet}

	{#snippet intro()}
		<p>
			The demo is <strong>the Support Desk</strong>: one customer, one refund question, three
			identical agents. One has no procedures at all. One has <em>every</em> procedure stuffed
			into its <Term t="System prompt">system prompt</Term>. One has a five-line catalog and reads
			the single manual it needs — then runs the script that manual ships. A deterministic
			inspector stamps every reply, and a context meter prices every round. Same model. Same
			question. Different wardrobe.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The problem" title="Instructions don't scale" variant="dropcap">
			<p>
				Real organizations run on procedure: refund rules, tone guides, escalation paths, privacy
				law. The naive move is to paste it all into the system prompt — and it <em>works</em>, at
				first. But every rule you add is paid on <em>every single model call</em>, relevant or
				not; ten procedures deep, your agent reads the whole employee handbook before saying
				"hello". Leave the rules out instead and the model improvises — confidently. A refund
				amount is exactly the kind of thing a model will <em>invent</em>, to the cent, with a
				straight face.
			</p>
			<p>
				<Term t="Skill">Skills</Term> are the third path: knowledge that lives <em>outside</em> the
				<Term t="Context window">context window</Term>, advertised by one line, loaded only when
				the task matches.
			</p>
		</Slide>

		<Slide eyebrow="The shape" title="A skill is a directory" variant="code-first">
			<p>
				Officially (the <em>Agent Skills standard</em>), a skill is not an object you pass in
				code — it's a directory on the <Term t="Backend">backend</Term> with a
				<Term t="SKILL.md"><code>SKILL.md</code></Term> at its root: YAML frontmatter
				(<code>name</code>, ≤64 chars, <strong>must match the directory name</strong>;
				<code>description</code>, ≤1024 chars) above a markdown body. Beside it, optionally:
				<code>scripts/</code> for executable helpers, <code>references/</code> for detail too
				bulky for the manual, <code>assets/</code> for templates.
			</p>
			<CodeBlock
				code={frontmatterCode}
				caption="SKILL.md — the frontmatter is the catalog entry; the body is the manual."
			/>
			<p>
				Keep the body under ~5k tokens, and reference supporting files <em>one level deep</em> —
				a skill that makes the agent chase a chain of reads defeats its own purpose.
			</p>
		</Slide>

		<Slide eyebrow="The mechanism" title="Three levels of disclosure">
			<p>
				The harness scans the configured source paths and injects <em>only frontmatter</em> into
				the prompt — that's <strong>level 1</strong>, the catalog: one line per skill, a few
				hundred tokens for a whole shelf. When a task matches a description, the agent
				<code>read_file</code>s the SKILL.md body — <strong>level 2</strong>, paid once, in the
				conversation, only when needed. The body then points at scripts and references —
				<strong>level 3</strong>, fetched on demand. There is <em>no</em>
				<code>load_skill</code> tool in the official package, and as of this lesson none in ours
				either: <strong>the filesystem is the disclosure mechanism</strong>. That's why skills
				compose with everything in this level — <Term t="Backend">backends</Term> store them,
				permissions guard them, and an agent can even <em>write</em> one mid-run and use it the
				next round.
			</p>
			<CodeBlock code={skillsCode} caption="skills: ['/skills/'] — paths, not prompt text." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-skills-disclosure"
				alt="A three-level cabinet: a card-catalog drawer of one-line index cards, a single manual open on a reading ledge, and a deep tool drawer of scripts, references and assets"
			/>
			<figcaption>
				The catalog is always in view; the manual is read when the task matches; the tools come
				out only when the manual calls for them.
			</figcaption>
		</figure>

		<Slide eyebrow="The interface" title="The description is load-bearing">
			<p>
				The agent decides whether to open a manual from its catalog line alone — so the
				<code>description</code> is a <em>trigger</em>, not a summary. Write what the skill does
				<em>and when to use it</em>, with the keywords a task would actually contain:
				"<em>Use whenever a customer asks to cancel, requests a refund, or asks how much money
				comes back</em>" beats "Helps with refunds" every time. When two descriptions overlap,
				consolidate or sharpen — a model facing five equally-plausible manuals opens none, or
				all of them.
			</p>
		</Slide>

		<Slide eyebrow="Level 3" title="Scripts: don't improvise math" variant="code-first">
			<p>
				The refund manual's first instruction is <em>"never compute a refund by hand"</em> —
				month boundaries, a 15% fee, cent-rounding: everything a model fumbles while sounding
				sure. So the skill ships <code>scripts/prorate.js</code>, and the procedure reduces to:
				run it, quote its numbers. Deterministic logic belongs in scripts precisely because the
				model should <em>not</em> be creative about it.
			</p>
			<CodeBlock code={scriptCode} caption="The skill teaches WHEN; the script computes WHAT." />
		</Slide>

		<Slide eyebrow="The experiment" title="Three desks, one question">
			<p>
				The demo dispatches the same customer to three clerks built from <em>identical</em> code —
				the only difference is the <code>skills</code> line and the system prompt. Watch three
				things: the <strong>stamp</strong> (the inspector recomputes the proration — ${EXPECTED.refund}
				— and checks the required disclosures), the <strong>meter</strong> (what the model
				actually read, round by round), and the skilled clerk's <strong>feed</strong>: catalog
				line → <code>read_file</code> the manual → <code>run_script</code> → disclosures. The
				crammed clerk usually passes too — that's the nuance. Cramming isn't <em>wrong</em>; it's
				<em>rent</em>, paid every round, for every procedure, forever. Ask the follow-up and
				watch it pay again.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-skills-three-clerks"
				alt="Triptych: a clerk inventing a number at a bare desk; a clerk buried under five chained-open manuals with a context gauge in the red; a calm clerk with a card catalog, one open manual, gauge nearly empty"
			/>
			<figcaption>Same model, same question, different wardrobe — the gauge is the bill.</figcaption>
		</figure>

		<Slide eyebrow="Travel rules" title="Where skills go (and don't)">
			<p>
				Skills ride the filesystem, so everything from this level applies. Put the shelf on a
				<Term t="Store">store</Term>-backed route and it survives threads. Guard it with
				<code>{permissionsSnippet}</code> and the curated shelf becomes read-only — or use
				<code>interrupt</code> to require sign-off on edits. Two sharp edges from the official
				docs: the auto <Term t="Subagent">general-purpose subagent</Term> inherits the parent's
				skills, but <strong>custom subagents inherit none</strong> — each needs its own
				<code>skills</code> list. And when two sources ship the same skill name, the
				<strong>last source wins</strong> — which is how a team's shelf deliberately overrides
				the company-wide default.
			</p>
		</Slide>

		<Slide variant="ornament">skills are wardrobe, not memory</Slide>

		<blockquote class="pull">
			Don't make the agent memorize the manual.<br />Teach it to find the shelf.
		</blockquote>

		<ReadMore
			links={[
				{
					label: 'Skills — SKILL.md, disclosure levels, sandboxed scripts',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/skills'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="The customer" subtitle="one request, dispatched to all three desks at once">
			<p class="request">“{CUSTOMER_REQUEST}”</p>
			<div class="actions">
				<RunButton
					onclick={() => askAll(CUSTOMER_REQUEST, 1)}
					running={busy}
					disabled={turnsDone > 0}
					label="Ask all three desks"
				/>
				<RunButton
					onclick={() => askAll(FOLLOW_UP, 2)}
					running={busy && turnsDone === 1}
					disabled={turnsDone !== 1 || busy}
					variant="ghost"
					label="Follow-up: “also delete my data”"
				/>
				{#if turnsDone > 0 && !busy}
					<button class="reset" onclick={reset}>reset</button>
				{/if}
			</div>
		</Panel>

		<Panel
			title="Three desks, one question"
			subtitle="same model, same tools — only the wardrobe differs"
		>
			<div class="desks">
				{#each CLERKS as clerk (clerk.variant)}
					{@const desk = desks[clerk.variant]}
					<div class="desk" class:active={desk.busy}>
						<header>
							<strong>{clerk.title}</strong>
							<span class="tagline">{clerk.tagline}</span>
						</header>

						<div class="chips">
							{#each loadedSkills(desk) as name (name)}
								<span class="chip manual">📖 {name}</span>
							{/each}
							{#each scriptRuns(desk) as run, i (i)}
								<span class="chip script" class:bad={!run.ok}>⚙ {run.label}{run.ok ? '' : ' ✗'}</span>
							{/each}
						</div>

						{#if desk.msgs.length}
							<div class="feedwrap"><AgentFeed messages={desk.msgs} maxHeight="17rem" /></div>
						{:else}
							<div class="placeholder">{desk.busy ? 'thinking…' : 'waiting for the customer'}</div>
						{/if}
						{#if desk.error}
							<p class="error">✗ {desk.error}</p>
						{/if}

						<div class="verdicts">
							{#each desk.verdicts as verdict (verdict.turn)}
								<div class="verdict" class:pass={verdict.v.pass}>
									<span class="stamp">{verdict.v.pass ? 'PASS' : 'REJECTED'}</span>
									<span class="turnlabel">turn {verdict.turn}</span>
									<ul>
										{#each verdict.v.checks as c (c.label)}
											<li class:ok={c.pass}>
												{c.pass ? '✓' : '✗'}
												{c.label}{c.detail ? ` — ${c.detail}` : ''}
											</li>
										{/each}
									</ul>
								</div>
							{:else}
								<div class="verdicts-placeholder">inspector verdict appears here</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</Panel>

		<Panel
			title="The context meter"
			subtitle="every bar is one model call — what the model actually read"
		>
			<div class="legend">
				<span><i class="sw core"></i> prompt (instructions + procedures)</span>
				<span><i class="sw cat"></i> skill catalog</span>
				<span><i class="sw chat"></i> conversation (incl. manuals read)</span>
			</div>
			<div class="meters">
				{#each CLERKS as clerk (clerk.variant)}
					{@const rounds = meters[clerk.variant]}
					<div class="meter">
						<header>
							<strong>{clerk.title.replace('The ', '')}</strong>
							{#if rounds.length}
								<span class="totals">
									model read <b>{fmtTok(totalsRead[clerk.variant])}</b> tok total
									{#if clerk.variant === 'skilled' && skillPayloadTokens(desks.skilled.msgs) > 0}
										· manuals on demand: {fmtTok(skillPayloadTokens(desks.skilled.msgs))}
									{/if}
								</span>
							{/if}
						</header>
						{#each rounds as m (m.round)}
							<div class="row">
								<span class="rlabel">R{m.round}</span>
								<div class="bar">
									<i class="core" style:width="{(m.promptCore / meterMax) * 100}%"></i>
									<i class="cat" style:width="{(m.catalog / meterMax) * 100}%"></i>
									<i class="chat" style:width="{(m.chat / meterMax) * 100}%"></i>
								</div>
								<span class="rtok">{fmtTok(m.total)}</span>
							</div>
						{:else}
							<div class="row idle">no calls yet</div>
						{/each}
					</div>
				{/each}
			</div>
			<p class="note">
				The crammed desk's wide “prompt” segment repeats on every round — that's the rent. The
				skilled desk pays a sliver of catalog, and the manual appears once, in the conversation,
				only after the agent chose to read it.
			</p>
		</Panel>

		<Panel title="The skill shelf" subtitle="the five manuals, exactly as seeded — click to review">
			<div class="shelf">
				{#each shelf as skill (skill.name)}
					<div class="skillrow">
						<span class="skillname">{skill.name}</span>
						<div class="files">
							{#each skill.files as f (f.path)}
								<button
									class="filechip"
									class:selected={selectedFile === f.path}
									onclick={() => (selectedFile = f.path)}>{f.label}</button
								>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<CodeBlock code={SKILL_FILES[selectedFile]} caption={selectedFile} />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.request {
		font-style: italic;
		color: var(--color-fg-muted);
		margin: 0 0 0.9rem;
	}
	.actions {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.reset {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-fg-faint);
		font: inherit;
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.reset:hover {
		border-color: var(--color-border-strong);
		color: var(--color-fg-muted);
	}

	/* ── the desks, stacked — full width per clerk, verdict beside the feed ── */
	.desks {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.desk {
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 0.75rem 0.85rem;
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
		gap: 0.55rem 0.9rem;
		align-items: start;
	}
	@media (max-width: 760px) {
		.desk {
			grid-template-columns: 1fr;
		}
	}
	.desk.active {
		border-color: color-mix(in oklch, var(--accent) 45%, var(--color-border));
	}
	.desk header {
		grid-column: 1 / -1;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.desk header strong {
		font-size: 0.95rem;
	}
	.desk .chips {
		grid-column: 1 / -1;
	}
	.desk .error {
		grid-column: 1 / -1;
	}
	.verdicts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}
	.verdicts-placeholder {
		border: 1px dashed var(--color-border);
		border-radius: 8px;
		padding: 1rem 0.6rem;
		text-align: center;
		color: var(--color-fg-faint);
		font-size: 0.74rem;
	}
	.tagline {
		font-size: 0.74rem;
		color: var(--color-fg-faint);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		min-height: 1.1rem;
	}
	.chip {
		font-size: 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		color: var(--color-fg-muted);
	}
	.chip.manual {
		border-color: color-mix(in oklch, var(--accent) 50%, var(--color-border));
	}
	.chip.script {
		border-color: color-mix(in oklch, var(--color-accent-success) 50%, var(--color-border));
	}
	.chip.script.bad {
		border-color: color-mix(in oklch, var(--color-accent-danger) 55%, var(--color-border));
	}
	.feedwrap {
		min-width: 0;
	}
	.placeholder {
		border: 1px dashed var(--color-border);
		border-radius: 8px;
		padding: 1.4rem 0.6rem;
		text-align: center;
		color: var(--color-fg-faint);
		font-size: 0.8rem;
	}
	.error {
		color: var(--color-accent-danger);
		font-size: 0.8rem;
		margin: 0;
	}

	.verdict {
		border: 1px solid color-mix(in oklch, var(--color-accent-danger) 45%, var(--color-border));
		border-radius: 8px;
		padding: 0.5rem 0.6rem;
		font-size: 0.76rem;
	}
	.verdict.pass {
		border-color: color-mix(in oklch, var(--color-accent-success) 45%, var(--color-border));
	}
	.stamp {
		font-weight: 700;
		letter-spacing: 0.14em;
		font-size: 0.72rem;
		color: var(--color-accent-danger);
		border: 1.5px solid currentColor;
		border-radius: 4px;
		padding: 0.05rem 0.4rem;
		transform: rotate(-2deg);
		display: inline-block;
	}
	.verdict.pass .stamp {
		color: var(--color-accent-success);
	}
	.turnlabel {
		margin-left: 0.5rem;
		color: var(--color-fg-faint);
	}
	.verdict ul {
		list-style: none;
		margin: 0.45rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.verdict li {
		color: var(--color-accent-danger);
	}
	.verdict li.ok {
		color: var(--color-fg-muted);
	}

	/* ── meters ── */
	.legend {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.74rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.7rem;
	}
	.sw {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 2px;
		vertical-align: -1px;
		margin-right: 0.3rem;
	}
	.sw.core,
	.bar :global(i.core),
	.bar i.core {
		background: color-mix(in oklch, var(--color-accent-warning) 55%, var(--color-ink-2));
	}
	.sw.cat,
	.bar i.cat {
		background: var(--accent);
	}
	.sw.chat,
	.bar i.chat {
		background: color-mix(in oklch, var(--color-fg-faint) 45%, var(--color-ink-2));
	}
	.meters {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.meter header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.3rem;
	}
	.meter header strong {
		font-size: 0.85rem;
	}
	.totals {
		font-size: 0.74rem;
		color: var(--color-fg-faint);
	}
	.totals b {
		color: var(--accent-ink);
	}
	.row {
		display: grid;
		grid-template-columns: 2rem 1fr 3.2rem;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}
	.row.idle {
		grid-template-columns: 1fr;
		color: var(--color-fg-faint);
		font-size: 0.76rem;
	}
	.rlabel,
	.rtok {
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
	}
	.rtok {
		text-align: right;
	}
	.bar {
		display: flex;
		height: 0.85rem;
		border-radius: 3px;
		overflow: hidden;
		background: color-mix(in oklch, var(--color-ink-0) 60%, transparent);
	}
	.bar i {
		display: block;
		height: 100%;
	}
	.note {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin: 0.8rem 0 0;
	}

	/* ── shelf ── */
	.shelf {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.9rem;
	}
	.skillrow {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.skillname {
		font-size: 0.8rem;
		font-weight: 600;
		min-width: 9.5rem;
	}
	.files {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.filechip {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 0.08rem 0.55rem;
		font: inherit;
		font-size: 0.72rem;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.filechip:hover {
		border-color: var(--color-border-strong);
	}
	.filechip.selected {
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.diagram {
		margin: 2.2rem 0;
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
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		text-align: center;
	}
	.pull {
		margin: 2.4rem 0;
		padding: 1.2rem 1.5rem;
		border-left: 3px solid var(--accent);
		background: color-mix(in oklch, var(--accent) 6%, transparent);
		font-family: var(--font-display, serif);
		font-style: italic;
		font-size: 1.15rem;
		line-height: 1.6;
	}
</style>
