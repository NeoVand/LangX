<script lang="ts">
	import ChapterRecap from '$lib/components/ChapterRecap.svelte';
	import { langgraphOverview } from '$lib/diagrams';
</script>

<ChapterRecap
	chapterId="langgraph"
	blurb="You took control of the runtime: StateGraph nodes and reducers, conditional edges, checkpointers and time travel, interrupts for human-in-the-loop, the three streaming modes, Send fan-out, and subgraph composition. This is the orchestration layer every Deep Agent runs on."
	diagram={langgraphOverview}
	next={{ href: '/3-deepagents', label: 'Continue to Phase 3 · Deep Agents' }}
/>
