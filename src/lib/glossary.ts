export interface GlossaryEntry {
	term: string;
	short: string;
	long: string;
	chapter: 'langchain' | 'langgraph' | 'deepagents' | 'general';
}

export const glossary: GlossaryEntry[] = [
	{
		term: 'Runnable',
		chapter: 'langchain',
		short: 'Anything implementing the standard invoke/stream/batch interface.',
		long: 'A unified protocol that wraps prompts, models, parsers, retrievers, and tools so they can be composed with the pipe operator.'
	},
	{
		term: 'LCEL',
		chapter: 'langchain',
		short: "LangChain's pipe-based composition language.",
		long: 'Builds chains declaratively: a | b | c means feed a into b, then b into c. Lazy: nothing runs until you call invoke / stream / batch.'
	},
	{
		term: 'RAG',
		chapter: 'langchain',
		short: 'Retrieval-augmented generation.',
		long: 'Look up relevant passages in a vector store and stuff them into the prompt so the model can answer questions with fresh or private knowledge.'
	},
	{
		term: 'StateGraph',
		chapter: 'langgraph',
		short: 'A typed state machine of nodes and edges.',
		long: 'You declare a state schema, register node functions that return partial state updates, and wire transitions between them.'
	},
	{
		term: 'Reducer',
		chapter: 'langgraph',
		short: 'Function that merges concurrent updates into a state field.',
		long: 'Default is last-write-wins. For lists you usually want concatenation (e.g., add_messages) so updates accumulate.'
	},
	{
		term: 'Checkpointer',
		chapter: 'langgraph',
		short: 'Saves graph state after every step.',
		long: 'Lets a run resume after a crash, lets you replay from any past step, and powers human-in-the-loop pauses.'
	},
	{
		term: 'Thread',
		chapter: 'langgraph',
		short: 'An ID grouping all checkpoints of one conversation.',
		long: 'Pass thread_id to the graph and every step is saved under it. Different thread_id = isolated session.'
	},
	{
		term: 'Time travel',
		chapter: 'langgraph',
		short: 'Replay or fork from an earlier checkpoint.',
		long: 'Pick a past checkpoint, change input or state, and run forward from that point — useful for debugging and what-if exploration.'
	},
	{
		term: 'Interrupt',
		chapter: 'langgraph',
		short: 'Pause inside a node until the host resumes it.',
		long: "interrupt(value) throws a special signal; the host receives the value, asks a human, then calls graph.invoke(new Command({ resume }))."
	},
	{
		term: 'Send',
		chapter: 'langgraph',
		short: 'Spawn a parallel branch with its own state.',
		long: 'Returned from a node to fan out work; results merge back via the schema reducers next superstep.'
	},
	{
		term: 'Superstep',
		chapter: 'langgraph',
		short: 'One synchronized round of graph execution.',
		long: 'Pregel-style: nodes run concurrently, emit updates, then the runtime merges them before the next round.'
	},
	{
		term: 'Subgraph',
		chapter: 'langgraph',
		short: 'A compiled graph used as a node inside another graph.',
		long: 'Lets you encapsulate a workflow (e.g., a RAG mini-graph) and reuse it.'
	},
	{
		term: 'Harness',
		chapter: 'deepagents',
		short: "Opinionated bundle around a bare agent loop.",
		long: 'Pre-wired prompt, default tools, planning, filesystem, subagents, summarization. You configure it; you do not implement it.'
	},
	{
		term: 'Middleware',
		chapter: 'deepagents',
		short: 'Pluggable hooks that wrap the agent loop.',
		long: 'They can mutate prompts, register tools, intercept tool results, summarize history, or pause for approval — all without rewriting the graph.'
	},
	{
		term: 'Virtual filesystem',
		chapter: 'deepagents',
		short: 'A shared workspace of files the agent reads and writes.',
		long: "Lives in graph state by default (StateBackend). Tools: ls, read_file, write_file, edit_file, glob, grep."
	},
	{
		term: 'StateBackend',
		chapter: 'deepagents',
		short: 'Files stored inside the active graph state.',
		long: 'Ephemeral: scoped to one thread; cleared when the session ends.'
	},
	{
		term: 'StoreBackend',
		chapter: 'deepagents',
		short: 'Files stored in a durable Store across threads.',
		long: 'Used for cross-session memory. In LangX we back it with IndexedDB (Dexie) so reloads survive.'
	},
	{
		term: 'CompositeBackend',
		chapter: 'deepagents',
		short: 'Routes paths to different backends.',
		long: 'Common pattern: route /memories/ to a StoreBackend, everything else to a StateBackend.'
	},
	{
		term: 'Permissions',
		chapter: 'deepagents',
		short: 'Declarative allow/deny rules for filesystem ops.',
		long: 'Rules are evaluated first-match-wins: { operations, paths, mode }. Enforced before the tool runs.'
	},
	{
		term: 'Sandbox',
		chapter: 'deepagents',
		short: 'Isolated environment where the agent runs shell or code safely.',
		long: 'Real production sandboxes are remote VMs (Modal, Daytona, Runloop). LangX uses a scoped JS interpreter Worker as a stand-in.'
	},
	{
		term: 'Scoped interpreter',
		chapter: 'deepagents',
		short: 'In-process JS execution without filesystem, shell, or network.',
		long: 'Useful for loops and data transformations without exposing a real shell.'
	},
	{
		term: 'write_todos',
		chapter: 'deepagents',
		short: 'Built-in planning tool.',
		long: 'The agent breaks the task into pending / in-progress / completed steps and stores them in graph state — externalized planning.'
	},
	{
		term: 'task tool',
		chapter: 'deepagents',
		short: 'Spawns an isolated subagent.',
		long: 'The subagent has its own context window, its own tools, and returns a single concise report — keeping the parent context clean.'
	},
	{
		term: 'Subagent',
		chapter: 'deepagents',
		short: 'Ephemeral child agent with its own scope.',
		long: 'Configured by name, description, prompt, optional tools, optional model. Runs to completion, returns a single report.'
	},
	{
		term: 'Skill',
		chapter: 'deepagents',
		short: 'A SKILL.md file describing on-demand expertise.',
		long: 'At startup only the name and description hit the prompt; the full body is loaded only when the agent decides to use the skill.'
	},
	{
		term: 'Progressive disclosure',
		chapter: 'deepagents',
		short: 'Load only metadata; reveal the full content on demand.',
		long: 'Keeps the prompt small while a large catalog of skills remains addressable.'
	},
	{
		term: 'Long-horizon',
		chapter: 'general',
		short: 'Tasks that run many steps and accumulate large context.',
		long: 'Research reports, multi-file code edits, or pipelines where the agent runs for minutes and produces many artifacts.'
	},
	{
		term: 'Context compaction',
		chapter: 'deepagents',
		short: 'Automatic shrinking of conversation context.',
		long: 'A pipeline of offloading huge tool outputs to files, truncating redundant tool arguments, summarizing older messages, and recovering from overflow errors.'
	},
	{
		term: 'Eviction',
		chapter: 'deepagents',
		short: 'Moving an oversized tool output to a virtual file.',
		long: 'The model sees a short preview and a path; it can read_file the full content if it needs to.'
	},
	{
		term: 'Summarization',
		chapter: 'deepagents',
		short: 'Replace older history with an LLM-generated summary.',
		long: 'Keeps the active context small; the raw history is appended to /conversation_history/ on disk.'
	},
	{
		term: 'Goal drift',
		chapter: 'deepagents',
		short: 'After summarization, the agent forgets the original goal.',
		long: 'Either declares done early or asks for clarification on something it already had — a key risk to test for.'
	},
	{
		term: 'Needle-in-a-haystack',
		chapter: 'deepagents',
		short: 'A test pattern for context compaction.',
		long: 'Hide a tiny fact early in the conversation, force compaction, then check that the agent can still retrieve it from disk.'
	},
	{
		term: 'MCP',
		chapter: 'deepagents',
		short: 'Model Context Protocol.',
		long: 'A standard way to plug external tool servers into an agent. The harness can connect to MCP servers as a tool source.'
	},
	{
		term: 'HITL',
		chapter: 'general',
		short: 'Human-in-the-loop.',
		long: 'Pause the agent at a sensitive step, surface the proposed action to a human, and only continue once approved (or after edits).'
	}
];

export function findGlossaryEntry(term: string): GlossaryEntry | undefined {
	const t = term.toLowerCase();
	return glossary.find((g) => g.term.toLowerCase() === t);
}
