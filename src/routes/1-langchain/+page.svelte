<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
</script>

<ChapterIntro
	id="langchain"
	heroId="chapter-langchain-hero"
	heroAlt="Cross-section of a brass pipe organ — LangChain, the pipeline"
	heroFocal="28% 50%"
>
	{#snippet intro()}
		<p>
			LangChain is the foundation layer: small, composable primitives — prompts, models,
			parsers, tools, retrievers — that all speak the same Runnable protocol. Master these
			six lessons and every later chapter is a recombination of them.
		</p>
	{/snippet}
</ChapterIntro>
