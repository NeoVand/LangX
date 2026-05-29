<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
</script>

<ChapterIntro
	id="langgraph"
	heroId="chapter-langgraph-hero"
	heroAlt="Topographic map of an imaginary city — nodes as temples, paths as edges, checkpoints at bridges"
	heroFocal="32% 48%"
>
	{#snippet intro()}
		<p>
			A <strong>StateGraph</strong> is a small state machine you can read like a diagram and step
			through like a debugger. Phase 2 swaps the linear pipe of LangChain for explicit nodes,
			explicit edges, and explicit shared state — the substrate every serious agent eventually
			grows into.
		</p>
	{/snippet}
</ChapterIntro>
