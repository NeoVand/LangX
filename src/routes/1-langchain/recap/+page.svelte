<script lang="ts">
	import ChapterRecap from '$lib/components/ChapterRecap.svelte';
	import { langchainOverview } from '$lib/diagrams';
</script>

<ChapterRecap
	chapterId="langchain"
	blurb="You assembled the foundation layer: Runnables and LCEL, streaming, typed structured output, tools, retrieval-augmented generation, and finally a ReAct agent. Every piece is composable — and every agent you build later sits on exactly this base."
	diagram={langchainOverview}
	next={{ href: '/2-langgraph', label: 'Continue to Phase 2 · LangGraph' }}
/>
