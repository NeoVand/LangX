<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<ChapterIntro
	id="deepagents"
	heroId="chapter-deepagents-hero"
	heroAlt="Scholar's library cutaway — workshop, subagent carrels, and a locked archive"
	heroFocal="30% 42%"
	tagline="Planning, files, subagents, and memory — the harness behind agents like Claude Code."
>
	{#snippet intro()}
		<p>
			A <Term t="Deep Agent">Deep Agent</Term> is an opinionated harness built on top of
			<Term t="LangGraph">LangGraph</Term> — its primitives pre-wired into a working cognitive system.
			<Term t="Planning">Planning</Term>, a
			<Term t="Virtual filesystem">virtual filesystem</Term>,
			<Term t="Subagent">subagent</Term> delegation, <Term t="Skill">skills</Term>,
			<Term t="Context compaction">context compaction</Term> and
			<Term t="HITL">human-in-the-loop</Term> all ship as <Term t="Middleware">middleware</Term>, so
			your job becomes declaring policy, not assembling plumbing.
		</p>
		<p>
			It is the layer agents like Claude Code are built on, and the heart of this course. Level 3
			wires the whole harness by hand — every gear visible — then points it at two real jobs: a
			deep-research bureau and an in-browser data scientist. We open with the harness end to end,
			then build it one capability at a time.
		</p>
	{/snippet}
</ChapterIntro>
