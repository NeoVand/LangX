<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
</script>

<svelte:head>
	<title>Beyond this course · LangX</title>
</svelte:head>

<Lesson
	title="Beyond this course"
	eyebrow="Level 3 · Lesson 12 · The road ahead"
	hero={{
		id: 'l3-beyond',
		alt: 'The workshop doors thrown open onto a vast dawn frontier of grander machinery; the automatons we met stand on the threshold, looking out'
	}}
>
	{#snippet motivation()}
		You built the whole <Term t="Harness">harness</Term> by hand, in a browser tab — every gear visible.
		This is the map of the country that begins where the workshop ends.
	{/snippet}

	{#snippet intro()}
		<p>
			There is no demo on this page, and nothing left to wire. Instead, a closing tour: the parts of
			the real <Term t="Deep Agent">Deep Agents</Term> world this course deliberately stood in for, the
			doors each lesson opens onto, and the documentation to walk through next. You already know the shapes
			— what changes from here is the substrate underneath them.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="What you built" title="The whole harness, glass-box" variant="dropcap">
			<p>
				Across this level you assembled a complete agent harness and watched every part of it work:
				the <a href="/3-deepagents/virtual-fs">virtual filesystem</a>, the
				<a href="/3-deepagents/todos">plan board</a>, pluggable
				<a href="/3-deepagents/backends">backends</a>,
				<a href="/3-deepagents/permissions">permissions</a>,
				<a href="/3-deepagents/subagents">subagents</a>,
				<a href="/3-deepagents/skills">skills</a>,
				<a href="/3-deepagents/compaction">context compaction</a>, and a
				<a href="/3-deepagents/hitl">human in the loop</a> — then pointed all of it at two real jobs
				in the <a href="/3-deepagents/capstone-research">research</a> and
				<a href="/3-deepagents/capstone-data-science">data-science</a> capstones.
			</p>
			<p>
				Keep one mental model as you leave: the stack is layered.
				<Term t="LangGraph">LangGraph</Term> is the runtime; <Term t="create_agent"
					>create_agent</Term
				>
				is a minimal agent on top of it; <Term t="Deep Agent">Deep Agents</Term> is a more opinionated
				harness on top of that — same building blocks, with a filesystem, subagents, context management
				and skills bundled in. The layers compose: any compiled graph is a valid subagent.
			</p>
		</Slide>

		<Slide eyebrow="The real thing" title="Reach for the package you stood in for">
			<p>
				<code>src/lib/deepagents/</code> is a deliberately small, observable re-implementation —
				built so you could read every line and see inside. For real work, use the actual
				<strong>deepagents</strong> package (JavaScript and Python). It is production-ready, built
				on LangGraph, with first-class <Term t="LangSmith">LangSmith</Term> tracing — and as of 2026 it
				even ships a <strong>browser entrypoint</strong>, so the "we had to build our own to run in
				a tab" caveat no longer holds. You built a glass model of a real engine; now you can drive
				the real one, and your map still fits.
			</p>
		</Slide>

		<Slide eyebrow="Real execution" title="The Mill becomes a real sandbox">
			<p>
				Our <a href="/3-deepagents/capstone-data-science">Mill</a> was a
				<Term t="Web Worker">Web Worker</Term> — isolated, but tiny. Production agents run code in real
				sandboxes — <Term t="Modal">Modal</Term>, <Term t="Daytona">Daytona</Term>,
				<Term t="Runloop">Runloop</Term>, Deno, or LangSmith sandboxes — containerised environments
				the agent spins up, runs a shell or notebook in, and tears down. For pure in-process
				evaluation there is a <Term t="Code interpreter">code interpreter</Term> (<Term t="QuickJS"
					>QuickJS</Term
				>
				<code>eval</code>) with parallel tool-calling and recursive workflows. Same idea as the Mill
				— write code, run it, read the result — at full power.
			</p>
		</Slide>

		<Slide eyebrow="Real memory" title="From IndexedDB to durable, versioned state">
			<p>
				Our <Term t="StoreBackend">StoreBackend</Term> was IndexedDB. In production the
				<Term t="BackendProtocol">BackendProtocol</Term> stays the same while the substrate grows up:
				a
				<Term t="PostgresSaver">Postgres checkpointer</Term> for durable graph state, a
				<Term t="FilesystemBackend">FilesystemBackend</Term> or
				<Term t="LocalShellBackend">LocalShellBackend</Term> for real disks and shells, and the
				<Term t="ContextHubBackend">ContextHubBackend</Term>, which versions every write of an
				agent's files like Git commits. Underneath, <Term t="Delta channels">delta channels</Term> store
				checkpoints as diffs — shrinking a multi-gigabyte session to megabytes. Everything you learned
				in <a href="/3-deepagents/backends">backends</a> and
				<a href="/3-deepagents/compaction">compaction</a> carries straight over.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-beyond-map"
				alt="An engraved explorer's chart of the territory past the workshop: labelled regions for sandboxes, managed deployment, harness profiles, streaming, the Agent Protocol, the Context Hub and evals, linked by glowing routes from the workshop's port."
			/>
			<figcaption>
				A chart of the frontier: the territories that begin where the workshop ends.
			</figcaption>
		</figure>

		<Slide eyebrow="Scaling out" title="Subagents that run while you sleep">
			<p>
				You watched <a href="/3-deepagents/subagents">subagents</a> run inline so you could see the
				delegation happen. In a long-lived deployment they run in the <strong>background</strong>
				over the <Term t="Agent Protocol">Agent Protocol</Term> — remote or co-deployed servers the parent
				dispatches to and collects a final report from, without blocking. Their state lives in a dedicated
				channel that survives <a href="/3-deepagents/compaction">compaction</a>, and you can steer a
				running task mid-flight. The <Term t="task">task</Term> pattern is identical; only the distance
				changes.
			</p>
		</Slide>

		<Slide eyebrow="Tuning" title="The harness is a performance layer">
			<p>
				The biggest surprise past the workshop: the harness is not just plumbing — it is a
				<strong>tunable</strong> layer. <Term t="Harness profile">Profiles</Term> bundle per-model defaults
				so one harness gets the best out of very different LLMs, including open-weight ones. The docs
				report that harness-layer changes <em>alone</em> moved a frontier coding model from 52.8% to
				66.5% on a benchmark — no new model, just a better harness. Pair that with evals to measure
				it, and the <a href="/3-deepagents/harness">harness</a> you configured becomes something you optimise.
			</p>
		</Slide>

		<Slide eyebrow="Observability" title="Typed streaming and real tracing">
			<p>
				Our tracer and <strong>AgentFeed</strong> were a hand-built window into the run. The real
				package gives you <Term t="Streaming">typed streaming</Term> — <code>streamEvents</code>
				projections for messages, tool calls and each subagent — and <Term t="LangSmith"
					>LangSmith</Term
				>
				for full tracing, evaluation and monitoring. The cockpit you saw in every lesson is exactly the
				shape a production UI subscribes to; you just get it typed and for free.
			</p>
		</Slide>

		<Slide eyebrow="Production" title="Ship it — and the products built on it">
			<p>
				To deploy, hand a managed runtime an agent file tree (<Term t="AGENTS.md">AGENTS.md</Term>,
				<code>skills/</code>, <code>subagents/</code>,
				<Term t="tools.json">tools.json</Term>), attach an <Term t="MCP">MCP</Term> server for tools,
				and run threads with interrupts and HTTP streaming — the harness shape is identical, only the
				target differs. And the same harness powers real products:
				<strong>Deep Agents Code</strong>, a Claude-Code-style terminal agent;
				<strong>Talon</strong>, a long-running local runtime with channel adapters (even WhatsApp)
				and a cron scheduler; and <strong>Open SWE</strong>, an autonomous software engineer. You
				have been building the thing they are made of.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-beyond-coda"
				alt="An engraved commemorative plate: a brass archway inscribed with the journey's stages, a single automaton stepping through toward an amethyst dawn, carrying a music score, a sealed research dossier and a certified data-science report."
			/>
			<figcaption>
				Onwards — through the arch of everything you wired, carrying what you made.
			</figcaption>
		</figure>

		<Slide eyebrow="An honest footnote" title="Where the model bent the truth, on purpose">
			<p>
				A teaching build makes trades. Our compaction used a small char-budget where the real
				harness summarises at 85% of the model's token window and offloads tool results past 20k
				tokens; our
				<Term t="task">task</Term> ran children in-process where production runs real graphs; our numbers
				were tuned for a single tab. None of that changes the <em>shape</em> — which is the whole
				point. The fastest way to be sure you understand the harness is to read its source: every
				piece lives in <code>src/lib/deepagents/</code>, and re-implementing it yourself is the best
				lesson left.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The capstones were dress rehearsals. You have the map and the muscle memory — now go build
				the thing only you would think to build.
			</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Deep Agents — overview & quickstart',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/overview'
				},
				{
					label: 'Deep Agents — going to production',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/going-to-production'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents'
				},
				{
					label: 'LangGraph docs — the runtime underneath',
					href: 'https://docs.langchain.com/oss/javascript/langgraph/overview'
				},
				{
					label: 'LangSmith — tracing, evals, deployment',
					href: 'https://docs.smith.langchain.com'
				}
			]}
		/>

		<Slide variant="ornament">harness · capstones · the frontier · onwards</Slide>
	{/snippet}
</Lesson>

<style>
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
</style>
