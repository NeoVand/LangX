<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<ChapterIntro
	id="deepagents"
	heroId="chapter-deepagents-hero"
	heroAlt="Scholar's library cutaway — workshop, subagent carrels, and a locked archive"
	heroFocal="30% 42%"
>
	{#snippet intro()}
		<p>
			A <Term t="Deep Agent">Deep Agent</Term> is what you get when <Term t="LangGraph">LangGraph</Term>'s primitives have been
			pre-wired into a working cognitive system. <Term t="Planning">Planning</Term>, a <Term t="Virtual filesystem">virtual filesystem</Term>, <Term t="Subagent">subagent</Term>
			delegation, <Term t="Context compaction">context compaction</Term>, and <Term t="HITL">human-in-the-loop</Term> all ship as <Term t="Middleware">middleware</Term> — your job
			becomes declaring policy, not assembling plumbing.
		</p>
	{/snippet}
</ChapterIntro>
