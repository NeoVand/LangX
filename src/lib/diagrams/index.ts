import type { DiagramSpec } from './types';

/* ────────────────────────────────────────────────────────────────────────
 * Visual language (one meaning each, used across every diagram):
 *   • flow edge  (default)      — solid line + one travelling token.
 *                                 Reads as: execution proceeds A → B.
 *   • link edge  (link: true)   — dim, thin, static line, no token.
 *                                 Reads as: A reads / writes / routes-to /
 *                                 is-composed-of B (a relationship, not a step).
 *   • node kinds — start/end = terminals, accent = the lesson's protagonist,
 *                  default = ordinary step, muted = passive data/resource,
 *                  ghost = an abstract / dynamic element (a function, a call).
 * ──────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────
 * Big-picture chapter overviews — the abstraction to show first.
 * ──────────────────────────────────────────────────────────────────────── */

/** Chapter 1 · LangChain: compose primitives into a chain, then into apps. */
export const langchainOverview: DiagramSpec = {
	title: 'The big picture',
	caption:
		'Small primitives compose into a chain (a relationship); that chain is what powers agents and RAG.',
	cols: 3,
	rows: 3,
	shape: 'square',
	groups: [{ col: 0, row: 0, cspan: 1, rspan: 3, label: 'primitives' }],
	nodes: [
		{ id: 'prompt', label: 'Prompt', icon: 'message', col: 0, row: 0 },
		{ id: 'model', label: 'Model', icon: 'cpu', kind: 'accent', col: 0, row: 1 },
		{ id: 'parser', label: 'Parser', icon: 'filter', col: 0, row: 2 },
		{
			id: 'chain',
			label: 'LCEL chain',
			sub: 'composed with |',
			icon: 'link',
			kind: 'accent',
			col: 1,
			row: 1
		},
		{ id: 'agent', label: 'Agent', sub: 'tools in a loop', icon: 'bot', col: 2, row: 0 },
		{ id: 'rag', label: 'RAG', sub: 'grounded answers', icon: 'search', col: 2, row: 2 }
	],
	edges: [
		{ from: 'prompt', to: 'chain', link: true },
		{ from: 'model', to: 'chain', link: true },
		{ from: 'parser', to: 'chain', link: true },
		{ from: 'chain', to: 'agent' },
		{ from: 'chain', to: 'rag' }
	]
};

/** Chapter 2 · LangGraph: control flows through a graph that branches on state. */
export const langgraphOverview: DiagramSpec = {
	title: 'The big picture',
	caption:
		'Control flows top to bottom; a router conditionally picks a node (a route), and every node reads and writes one shared state.',
	cols: 3,
	rows: 4,
	shape: 'portrait',
	nodes: [
		{ id: 'start', label: 'START', icon: 'play', kind: 'start', col: 1, row: 0 },
		{ id: 'router', label: 'router', sub: 'fn(state)', icon: 'branch', kind: 'ghost', col: 1, row: 1 },
		{ id: 'a', label: 'node A', icon: 'box', kind: 'accent', col: 0, row: 2 },
		{
			id: 'state',
			label: 'shared state',
			sub: 'reducers merge',
			icon: 'database',
			kind: 'muted',
			col: 1,
			row: 2
		},
		{ id: 'b', label: 'node B', icon: 'box', kind: 'accent', col: 2, row: 2 },
		{ id: 'end', label: 'END', icon: 'flag', kind: 'end', col: 1, row: 3 }
	],
	edges: [
		{ from: 'start', to: 'router' },
		{ from: 'router', to: 'a', link: true, label: 'route A' },
		{ from: 'router', to: 'b', link: true, label: 'route B' },
		{ from: 'a', to: 'state', link: true },
		{ from: 'b', to: 'state', link: true },
		{ from: 'state', to: 'end' }
	]
};

/** Chapter 3 · Deep Agents: a model loop wrapped by six middleware capabilities. */
export const deepagentsOverview: DiagramSpec = {
	title: 'The big picture',
	caption:
		'A Deep Agent is a model loop the harness wraps with six middleware capabilities — you configure them, you do not implement them.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{
			id: 'agent',
			label: 'Agent loop',
			sub: 'model + tools',
			icon: 'bot',
			kind: 'accent',
			col: 1,
			row: 1
		},
		{ id: 'plan', label: 'Planning', sub: 'write_todos', icon: 'list', col: 0, row: 0 },
		{ id: 'fs', label: 'Filesystem', sub: 'read · edit · ls', icon: 'folder', col: 0, row: 1 },
		{ id: 'memory', label: 'Memory', sub: 'across threads', icon: 'database', col: 0, row: 2 },
		{ id: 'skills', label: 'Skills', sub: 'load on demand', icon: 'sparkle', col: 2, row: 0 },
		{ id: 'subs', label: 'Subagents', sub: 'isolated context', icon: 'layers', col: 2, row: 1 },
		{ id: 'hitl', label: 'Human-in-loop', sub: 'approve · edit', icon: 'user', col: 2, row: 2 }
	],
	edges: [
		{ from: 'agent', to: 'plan' },
		{ from: 'agent', to: 'fs' },
		{ from: 'agent', to: 'memory' },
		{ from: 'agent', to: 'skills' },
		{ from: 'agent', to: 'subs' },
		{ from: 'agent', to: 'hitl' }
	]
};

/* ────────────────────────────────────────────────────────────────────────
 * Phase 1 · LangChain
 * ──────────────────────────────────────────────────────────────────────── */

/** LCEL pipeline: prompt | model | parser. */
export const lcelPipeline: DiagramSpec = {
	title: 'An LCEL chain',
	caption: 'Each Runnable pipes its output into the next — the value changes shape at every stop.',
	cols: 1,
	rows: 5,
	shape: 'portrait',
	nodes: [
		{ id: 'in', label: 'input', sub: '{ topic }', icon: 'play', kind: 'start', col: 0, row: 0 },
		{ id: 'prompt', label: 'PromptTemplate', icon: 'message', col: 0, row: 1 },
		{ id: 'model', label: 'ChatModel', icon: 'cpu', kind: 'accent', col: 0, row: 2 },
		{ id: 'parser', label: 'OutputParser', icon: 'filter', col: 0, row: 3 },
		{ id: 'out', label: 'output', sub: 'string', icon: 'flag', kind: 'end', col: 0, row: 4 }
	],
	edges: [
		{ from: 'in', to: 'prompt' },
		{ from: 'prompt', to: 'model' },
		{ from: 'model', to: 'parser' },
		{ from: 'parser', to: 'out' }
	]
};

/** The ReAct loop behind create_agent. */
export const reactLoop: DiagramSpec = {
	title: 'The agent loop',
	caption: 'create_agent calls the model, runs any requested tools, and loops until it stops asking.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'start', label: 'START', icon: 'play', kind: 'start', col: 1, row: 0 },
		{ id: 'agent', label: 'agent', sub: 'call model', icon: 'bot', kind: 'accent', col: 1, row: 1 },
		{ id: 'tools', label: 'tools', sub: 'run tool calls', icon: 'wrench', col: 1, row: 2 },
		{ id: 'end', label: 'END', icon: 'flag', kind: 'end', col: 2, row: 1 }
	],
	edges: [
		{ from: 'start', to: 'agent' },
		{ from: 'agent', to: 'tools', label: 'tool calls' },
		{ from: 'tools', to: 'agent', side: 'left', label: 'results' },
		{ from: 'agent', to: 'end', label: 'done' }
	]
};

/** RAG read path. */
export const ragFlow: DiagramSpec = {
	title: 'The RAG read path',
	caption: 'Embed the query, retrieve the nearest chunks from the store, then answer grounded in them.',
	cols: 2,
	rows: 4,
	shape: 'portrait',
	nodes: [
		{ id: 'q', label: 'query', icon: 'message', kind: 'start', col: 0, row: 0 },
		{
			id: 'retrieve',
			label: 'retrieve',
			sub: 'embed · top-k',
			icon: 'search',
			kind: 'accent',
			col: 0,
			row: 1
		},
		{
			id: 'store',
			label: 'vector store',
			sub: 'indexed chunks',
			icon: 'database',
			kind: 'muted',
			col: 1,
			row: 1
		},
		{ id: 'gen', label: 'LLM + context', icon: 'cpu', col: 0, row: 2 },
		{ id: 'a', label: 'answer', icon: 'flag', kind: 'end', col: 0, row: 3 }
	],
	edges: [
		{ from: 'q', to: 'retrieve' },
		{ from: 'store', to: 'retrieve', link: true, label: 'top-k' },
		{ from: 'retrieve', to: 'gen', label: 'chunks' },
		{ from: 'gen', to: 'a' }
	]
};

/* ────────────────────────────────────────────────────────────────────────
 * Phase 2 · LangGraph
 * ──────────────────────────────────────────────────────────────────────── */

/** StateGraph triad: state, nodes, edges. */
export const stateGraphTriad: DiagramSpec = {
	title: 'A StateGraph',
	caption: 'Nodes run in sequence (flow) and each reads and writes one shared state (a relationship).',
	cols: 2,
	rows: 4,
	shape: 'portrait',
	groups: [{ col: 0, row: 1, cspan: 1, rspan: 2, label: 'graph' }],
	nodes: [
		{ id: 'start', label: 'START', icon: 'play', kind: 'start', col: 0, row: 0 },
		{ id: 'n1', label: 'node A', icon: 'box', kind: 'accent', col: 0, row: 1 },
		{ id: 'n2', label: 'node B', icon: 'box', kind: 'accent', col: 0, row: 2 },
		{ id: 'end', label: 'END', icon: 'flag', kind: 'end', col: 0, row: 3 },
		{ id: 'state', label: 'shared state', sub: 'reducers', icon: 'database', kind: 'muted', col: 1, row: 1 }
	],
	edges: [
		{ from: 'start', to: 'n1' },
		{ from: 'n1', to: 'n2' },
		{ from: 'n2', to: 'end' },
		{ from: 'n1', to: 'state', link: true },
		{ from: 'n2', to: 'state', link: true }
	]
};

/** Conditional edges (router). */
export const conditionalEdges: DiagramSpec = {
	title: 'Conditional edges',
	caption: 'A router inspects the state and returns ONE next node — these are the possible routes.',
	cols: 2,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'classify', label: 'classify', sub: 'router fn', icon: 'branch', kind: 'accent', col: 0, row: 1 },
		{ id: 'billing', label: 'billing', icon: 'box', col: 1, row: 0 },
		{ id: 'tech', label: 'technical', icon: 'box', col: 1, row: 1 },
		{ id: 'general', label: 'general', icon: 'box', col: 1, row: 2 }
	],
	edges: [
		{ from: 'classify', to: 'billing', link: true, label: 'billing' },
		{ from: 'classify', to: 'tech', link: true, label: 'tech' },
		{ from: 'classify', to: 'general', link: true, label: 'general' }
	]
};

/** Checkpointer / threads. */
export const checkpointer: DiagramSpec = {
	title: 'Checkpointers',
	caption: 'Steps run in sequence; after each one the state is snapshotted to the checkpointer (a write).',
	cols: 2,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 's1', label: 'step 1', icon: 'box', kind: 'accent', col: 0, row: 0 },
		{ id: 's2', label: 'step 2', icon: 'box', kind: 'accent', col: 0, row: 1 },
		{ id: 's3', label: 'step 3', icon: 'box', kind: 'accent', col: 0, row: 2 },
		{ id: 'cp', label: 'checkpointer', sub: 'thread snapshots', icon: 'clock', kind: 'muted', col: 1, row: 1 }
	],
	edges: [
		{ from: 's1', to: 's2' },
		{ from: 's2', to: 's3' },
		{ from: 's1', to: 'cp', link: true },
		{ from: 's2', to: 'cp', link: true },
		{ from: 's3', to: 'cp', link: true }
	]
};

/** Interrupt / resume sequence. */
export const interruptResume: DiagramSpec = {
	title: 'Interrupt & resume',
	caption: 'interrupt() pauses the run and surfaces a payload to a human; their decision resumes it.',
	cols: 2,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'run', label: 'node runs', icon: 'cpu', kind: 'accent', col: 0, row: 0 },
		{ id: 'pause', label: 'interrupt()', sub: 'run pauses', icon: 'pause', kind: 'end', col: 0, row: 1 },
		{ id: 'human', label: 'human', sub: 'approve / edit', icon: 'user', kind: 'ghost', col: 1, row: 1 },
		{ id: 'resume', label: 'resume', sub: 'Command()', icon: 'play', kind: 'start', col: 0, row: 2 }
	],
	edges: [
		{ from: 'run', to: 'pause' },
		{ from: 'pause', to: 'human', link: true, label: 'ask' },
		{ from: 'human', to: 'resume', link: true, label: 'decide' }
	]
};

/** Send fan-out (map-reduce). */
export const sendFanout: DiagramSpec = {
	title: 'Send fan-out',
	caption: 'One Send per item runs every worker in parallel; their results fan back into a reducer.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'map', label: 'map', sub: 'one Send / item', icon: 'send', kind: 'accent', col: 0, row: 1 },
		{ id: 'w1', label: 'worker', icon: 'box', col: 1, row: 0 },
		{ id: 'w2', label: 'worker', icon: 'box', col: 1, row: 1 },
		{ id: 'w3', label: 'worker', icon: 'box', col: 1, row: 2 },
		{ id: 'reduce', label: 'reduce', sub: 'fan-in', icon: 'merge', kind: 'end', col: 2, row: 1 }
	],
	edges: [
		{ from: 'map', to: 'w1', label: 'Send' },
		{ from: 'map', to: 'w2' },
		{ from: 'map', to: 'w3' },
		{ from: 'w1', to: 'reduce' },
		{ from: 'w2', to: 'reduce' },
		{ from: 'w3', to: 'reduce' }
	]
};

/** Subgraph composition. */
export const subgraphs: DiagramSpec = {
	title: 'Subgraphs',
	caption: 'A compiled graph can be dropped in as a node — with its own private state.',
	cols: 1,
	rows: 4,
	shape: 'portrait',
	groups: [{ col: 0, row: 2, cspan: 1, rspan: 1, label: 'subgraph', kind: 'accent' }],
	nodes: [
		{ id: 'start', label: 'START', icon: 'play', kind: 'start', col: 0, row: 0 },
		{ id: 'outer', label: 'parent node', icon: 'box', col: 0, row: 1 },
		{ id: 'sub', label: 'subgraph', sub: 'own state', icon: 'layers', kind: 'accent', col: 0, row: 2 },
		{ id: 'end', label: 'END', icon: 'flag', kind: 'end', col: 0, row: 3 }
	],
	edges: [
		{ from: 'start', to: 'outer' },
		{ from: 'outer', to: 'sub' },
		{ from: 'sub', to: 'end' }
	]
};

/* ────────────────────────────────────────────────────────────────────────
 * Phase 3 · Deep Agents
 * ──────────────────────────────────────────────────────────────────────── */

/** Harness layers. */
export const harnessLayers: DiagramSpec = {
	title: 'The system prompt',
	caption: 'The harness concatenates three sources into one prompt: BASE, then MIDDLEWARE, then USER.',
	cols: 2,
	rows: 3,
	shape: 'square',
	groups: [{ col: 0, row: 0, cspan: 2, rspan: 3, label: 'assembled prompt' }],
	nodes: [
		{ id: 'base', label: 'BASE', sub: 'plan · files · delegate', icon: 'book', kind: 'muted', col: 0, row: 0, cspan: 2 },
		{ id: 'mid', label: 'MIDDLEWARE', sub: 'todos · fs · skills · subagents', icon: 'layers', kind: 'accent', col: 0, row: 1, cspan: 2 },
		{ id: 'user', label: 'USER', sub: 'your instructions', icon: 'user', col: 0, row: 2, cspan: 2 }
	],
	edges: [
		{ from: 'base', to: 'mid' },
		{ from: 'mid', to: 'user' }
	]
};

/** Backends routing. */
export const backends: DiagramSpec = {
	title: 'Composite backend',
	caption: 'One set of file tools; CompositeBackend routes each path to State or Store by its prefix.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'fs', label: 'file tools', sub: 'read · edit', icon: 'folder', kind: 'accent', col: 0, row: 1 },
		{ id: 'composite', label: 'Composite', sub: 'prefix match', icon: 'branch', kind: 'ghost', col: 1, row: 1 },
		{ id: 'state', label: 'State', sub: 'ephemeral', icon: 'cpu', kind: 'muted', col: 2, row: 0 },
		{ id: 'store', label: 'Store', sub: 'durable', icon: 'database', kind: 'muted', col: 2, row: 2 }
	],
	edges: [
		{ from: 'fs', to: 'composite' },
		{ from: 'composite', to: 'state', link: true, label: '/scratch' },
		{ from: 'composite', to: 'store', link: true, label: '/memories' }
	]
};

/** Compaction before/after. */
export const compaction: DiagramSpec = {
	title: 'Context compaction',
	caption: 'When the window fills, two operations run on the history — evict and summarize — to get back under budget.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'big', label: 'long history', sub: 'over budget', icon: 'list', kind: 'muted', col: 0, row: 1 },
		{ id: 'evict', label: 'evict', sub: 'drop blobs', icon: 'scissors', col: 1, row: 0 },
		{ id: 'summ', label: 'summarize', sub: 'old turns', icon: 'book', col: 1, row: 2 },
		{ id: 'small', label: 'compact', sub: 'under budget', icon: 'check', kind: 'accent', col: 2, row: 1 }
	],
	edges: [
		{ from: 'big', to: 'evict' },
		{ from: 'big', to: 'summ' },
		{ from: 'evict', to: 'small' },
		{ from: 'summ', to: 'small' }
	]
};

/** Skills progressive disclosure. */
export const skillsDisclosure: DiagramSpec = {
	title: 'Progressive disclosure',
	caption: 'Only skill names and one-line descriptions ship in the prompt; the body loads on demand.',
	cols: 2,
	rows: 3,
	shape: 'portrait',
	nodes: [
		{ id: 'prompt', label: 'system prompt', sub: 'names + descriptions', icon: 'list', kind: 'accent', col: 0, row: 0, cspan: 2 },
		{ id: 'load', label: 'load_skill(name)', sub: 'when relevant', icon: 'sparkle', kind: 'ghost', col: 0, row: 1, cspan: 2 },
		{ id: 'body', label: 'full SKILL.md', sub: 'returned as a tool result', icon: 'book', kind: 'muted', col: 0, row: 2, cspan: 2 }
	],
	edges: [
		{ from: 'prompt', to: 'load', label: 'pick' },
		{ from: 'load', to: 'body', label: 'expand' }
	]
};

/** Subagent isolation. */
export const subagentIsolation: DiagramSpec = {
	title: 'Subagent isolation',
	caption: 'task() spawns a subagent with its own context; only the final report returns to the parent.',
	cols: 3,
	rows: 3,
	shape: 'square',
	groups: [{ col: 2, row: 0, cspan: 1, rspan: 1, label: 'isolated', kind: 'accent' }],
	nodes: [
		{ id: 'parent', label: 'parent', sub: 'main context', icon: 'bot', kind: 'accent', col: 0, row: 1 },
		{ id: 'task', label: 'task()', icon: 'send', kind: 'ghost', col: 1, row: 1 },
		{ id: 'sub', label: 'subagent', sub: 'own context', icon: 'bot', col: 2, row: 0 },
		{ id: 'report', label: 'report', icon: 'file', kind: 'end', col: 2, row: 2 }
	],
	edges: [
		{ from: 'parent', to: 'task' },
		{ from: 'task', to: 'sub', label: 'prompt' },
		{ from: 'sub', to: 'report' },
		{ from: 'report', to: 'parent', label: 'summary' }
	]
};
