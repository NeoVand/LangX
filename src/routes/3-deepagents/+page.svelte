<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
</script>

<ChapterIntro
	id="deepagents"
	heroId="chapter-deepagents-hero"
	heroAlt="Scholar's library cutaway — workshop, subagent carrels, and a locked archive"
	heroFocal="30% 42%"
>
	{#snippet intro()}
		<p>
			A <strong>Deep Agent</strong> is what you get when LangGraph's primitives have been
			pre-wired into a working cognitive system. Planning, a virtual filesystem, subagent
			delegation, context compaction, and human-in-the-loop all ship as middleware — your job
			becomes declaring policy, not assembling plumbing.
		</p>
	{/snippet}
</ChapterIntro>
