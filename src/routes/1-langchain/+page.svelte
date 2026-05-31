<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<ChapterIntro
	id="langchain"
	heroId="chapter-langchain-hero"
	heroAlt="Brass steampunk pipework with glowing fluid recombining — LangChain, the pipeline"
	heroFocal="50% 42%"
	tagline="Six small primitives, one protocol — the vocabulary every agent in this course is written in."
>
	{#snippet intro()}
		<p>
			<Term t="LangChain" /> is the foundation layer — a small set of composable building blocks
			(<Term t="Prompt">prompts</Term>, <Term t="Model">models</Term>,
			<Term t="Parser">parsers</Term>, <Term t="tool">tools</Term>, and
			<Term t="Retriever">retrievers</Term>) that all speak one interface, the
			<Term t="Runnable" />. Snap them together with a pipe (<Term t="LCEL" />) and you get
			<Term t="Chain">chains</Term>, <Term t="RAG" />, and <Term t="Agent">agents</Term>.
		</p>
		<p>
			Master these pieces and the rest of the course is just recombination:
			<Term t="LangGraph" /> (Level 2) wraps them in state and loops, and
			<Term t="Deep Agent">Deep Agents</Term> (Level 3) bundle the whole thing into a harness. We
			open with a bird's-eye demo, then take each part apart.
		</p>
	{/snippet}
</ChapterIntro>
