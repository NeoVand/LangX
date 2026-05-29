import type { DiagramSpec } from './types';

/* ────────────────────────────────────────────────────────────────────────
 * Big-picture chapter overviews — the abstraction to show first.
 * ──────────────────────────────────────────────────────────────────────── */

/** Chapter 1 · LangChain: compose primitives into chains, then into apps. */
export const langchainOverview: DiagramSpec = {
	title: 'The big picture',
	caption: 'LangChain gives you small primitives; you compose them into chains, then into apps.',
	cols: 3,
	rows: 3,
	shape: 'square',
	groups: [{ col: 0, row: 0, cspan: 1, rspan: 3, label: 'primitives' }],
	nodes: [
		{ id: 'prompt', label: 'Prompt', icon: 'message', col: 0, row: 0 },
		{ id: 'model', label: 'Model', icon: 'cpu', kind: 'accent', col: 0, row: 1 },
		{ id: 'parser', label: 'Parser', icon: 'filter', col: 0, row: 2 },
		{ id: 'chain', label: 'LCEL chain', sub: 'compose with |', icon: 'link', kind: 'accent', col: 1, row: 1 },
		{ id: 'agent', label: 'Agent', sub: 'tools in a loop', icon: 'bot', col: 2, row: 0 },
		{ id: 'rag', label: 'RAG', sub: 'grounded answers', icon: 'search', col: 2, row: 2 }
	],
	edges: [
		{ from: 'prompt', to: 'chain', dashed: true },
		{ from: 'model', to: 'chain', dashed: true },
		{ from: 'parser', to: 'chain', dashed: true },
		{ from: 'chain', to: 'agent', flow: true },
		{ from: 'chain', to: 'rag', flow: true }
	]
};

/** Chapter 2 · LangGraph: route state through a graph that can branch and loop. */
export const langgraphOverview: DiagramSpec = {
	title: 'The big picture',
	caption: 'LangGraph runs your logic as a graph: nodes branch on state and converge again.',
	cols: 3,
	rows: 4,
	shape: 'portrait',
	nodes: [
		{ id: 'start', label: 'START', icon: 'play', kind: 'start', col: 1, row: 0 },
		{ id: 'router', label: 'router', sub: 'fn(state)', icon: 'branch', kind: 'ghost', col: 1, row: 1 },
		{ id: 'a', label: 'node A', icon: 'box', kind: 'accent', col: 0, row: 2 },
		{ id: 'b', label: 'node B', icon: 'box', kind: 'accent', col: 2, row: 2 },
		{ id: 'state', label: 'shared state', sub: 'reducers merge', icon: 'database', kind: 'muted', col: 1, row: 2 },
		{ id: 'end', label: 'END', icon: 'flag', kind: 'end', col: 1, row: 3 }
	],
	edges: [
		{ from: 'start', to: 'router', flow: true },
		{ from: 'router', to: 'a', dashed: true, label: 'path A' },
		{ from: 'router', to: 'b', dashed: true, label: 'path B' },
		{ from: 'a', to: 'state' },
		{ from: 'b', to: 'state' },
		{ from: 'state', to: 'end', flow: true }
	]
};

/** Chapter 3 · Deep Agents: an agent loop surrounded by harness capabilities. */
export const deepagentsOverview: DiagramSpec = {
	title: 'The big picture',
	caption: 'A Deep Agent is a model loop wrapped in middleware: planning, files, skills, subagents.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'plan', label: 'Planning', sub: 'write_todos', icon: 'list', col: 1, row: 0 },
		{ id: 'fs', label: 'Filesystem', sub: 'read · edit · ls', icon: 'folder', col: 0, row: 1 },
		{ id: 'agent', label: 'Agent loop', sub: 'model + tools', icon: 'bot', kind: 'accent', col: 1, row: 1 },
		{ id: 'skills', label: 'Skills', sub: 'load on demand', icon: 'sparkle', col: 2, row: 1 },
		{ id: 'subs', label: 'Subagents', sub: 'isolated context', icon: 'layers', col: 1, row: 2 }
	],
	edges: [
		{ from: 'agent', to: 'plan', dashed: true },
		{ from: 'agent', to: 'fs', dashed: true },
		{ from: 'agent', to: 'skills', dashed: true },
		{ from: 'agent', to: 'subs', dashed: true }
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
		{ from: 'in', to: 'prompt', flow: true },
		{ from: 'prompt', to: 'model', flow: true },
		{ from: 'model', to: 'parser', flow: true },
		{ from: 'parser', to: 'out', flow: true }
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
		{ from: 'start', to: 'agent', flow: true },
		{ from: 'agent', to: 'tools', label: 'tool calls', flow: true },
		{ from: 'tools', to: 'agent', side: 'left', label: 'results' },
		{ from: 'agent', to: 'end', label: 'done' }
	]
};

/** RAG read path. */
export const ragFlow: DiagramSpec = {
	title: 'The RAG read path',
	caption: 'Embed the query, retrieve the nearest chunks, then answer grounded in that context.',
	cols: 2,
	rows: 4,
	shape: 'portrait',
	nodes: [
		{ id: 'q', label: 'query', icon: 'message', kind: 'start', col: 0, row: 0 },
		{ id: 'retrieve', label: 'retrieve', sub: 'embed · top-k', icon: 'search', kind: 'accent', col: 0, row: 1 },
		{ id: 'store', label: 'vector store', sub: 'indexed chunks', icon: 'database', kind: 'muted', col: 1, row: 1 },
		{ id: 'gen', label: 'LLM + context', icon: 'cpu', col: 0, row: 2 },
		{ id: 'a', label: 'answer', icon: 'flag', kind: 'end', col: 0, row: 3 }
	],
	edges: [
		{ from: 'q', to: 'retrieve', flow: true },
		{ from: 'store', to: 'retrieve', dashed: true, label: 'index' },
		{ from: 'retrieve', to: 'gen', flow: true, label: 'chunks' },
		{ from: 'gen', to: 'a', flow: true }
	]
};

/* ────────────────────────────────────────────────────────────────────────
 * Phase 2 · LangGraph
 * ──────────────────────────────────────────────────────────────────────── */

/** StateGraph triad: state, nodes, edges. */
export const stateGraphTriad: DiagramSpec = {
	title: 'A StateGraph',
	caption: 'Nodes read and write one shared state object; reducers decide how updates merge.',
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
		{ from: 'start', to: 'n1', flow: true },
		{ from: 'n1', to: 'n2', flow: true },
		{ from: 'n2', to: 'end', flow: true },
		{ from: 'n1', to: 'state', dashed: true },
		{ from: 'n2', to: 'state', dashed: true }
	]
};

/** Conditional edges (router). */
export const conditionalEdges: DiagramSpec = {
	title: 'Conditional edges',
	caption: 'A router function inspects the state and returns the name of the next node.',
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
		{ from: 'classify', to: 'billing', dashed: true, label: 'billing' },
		{ from: 'classify', to: 'tech', dashed: true, label: 'tech' },
		{ from: 'classify', to: 'general', dashed: true, label: 'general' }
	]
};

/** Checkpointer / threads. */
export const checkpointer: DiagramSpec = {
	title: 'Checkpointers',
	caption: 'After every superstep the state is snapshotted, keyed by thread_id — so you can resume.',
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
		{ from: 's1', to: 's2', flow: true },
		{ from: 's2', to: 's3', flow: true },
		{ from: 's1', to: 'cp', dashed: true },
		{ from: 's2', to: 'cp', dashed: true },
		{ from: 's3', to: 'cp', dashed: true }
	]
};

/** Interrupt / resume sequence. */
export const interruptResume: DiagramSpec = {
	title: 'Interrupt & resume',
	caption: 'interrupt() pauses the graph and surfaces a payload; Command({ resume }) continues it.',
	cols: 2,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'run', label: 'node runs', icon: 'cpu', kind: 'accent', col: 0, row: 0 },
		{ id: 'pause', label: 'interrupt()', sub: 'graph pauses', icon: 'pause', kind: 'end', col: 0, row: 1 },
		{ id: 'human', label: 'human', sub: 'approve / edit', icon: 'user', kind: 'ghost', col: 1, row: 1 },
		{ id: 'resume', label: 'resume', sub: 'Command()', icon: 'play', kind: 'start', col: 0, row: 2 }
	],
	edges: [
		{ from: 'run', to: 'pause', flow: true },
		{ from: 'pause', to: 'human', dashed: true, label: 'ask' },
		{ from: 'human', to: 'resume', dashed: true, label: 'decide' }
	]
};

/** Send fan-out (map-reduce). */
export const sendFanout: DiagramSpec = {
	title: 'Send fan-out',
	caption: 'Send dispatches one worker invocation per item; results fan back into a reducer.',
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
		{ from: 'map', to: 'w1', dashed: true, label: 'Send' },
		{ from: 'map', to: 'w2', dashed: true },
		{ from: 'map', to: 'w3', dashed: true },
		{ from: 'w1', to: 'reduce', flow: true },
		{ from: 'w2', to: 'reduce', flow: true },
		{ from: 'w3', to: 'reduce', flow: true }
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
		{ from: 'start', to: 'outer', flow: true },
		{ from: 'outer', to: 'sub', flow: true },
		{ from: 'sub', to: 'end', flow: true }
	]
};

/* ────────────────────────────────────────────────────────────────────────
 * Phase 3 · Deep Agents
 * ──────────────────────────────────────────────────────────────────────── */

/** Harness layers. */
export const harnessLayers: DiagramSpec = {
	title: 'The system prompt',
	caption: 'The harness layers three sources into one prompt: BASE, then MIDDLEWARE, then USER.',
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
		{ from: 'base', to: 'mid', flow: true },
		{ from: 'mid', to: 'user', flow: true }
	]
};

/** Backends routing. */
export const backends: DiagramSpec = {
	title: 'Composite backend',
	caption: 'One set of file tools; CompositeBackend routes each path to State or Store by prefix.',
	cols: 3,
	rows: 3,
	shape: 'square',
	nodes: [
		{ id: 'fs', label: 'file tools', sub: 'read · edit', icon: 'folder', kind: 'accent', col: 0, row: 1 },
		{ id: 'composite', label: 'Composite', sub: 'prefix match', icon: 'branch', kind: 'ghost', col: 1, row: 1 },
		{ id: 'state', label: 'State', sub: '/scratch · temp', icon: 'cpu', kind: 'muted', col: 2, row: 0 },
		{ id: 'store', label: 'Store', sub: '/memories · durable', icon: 'database', kind: 'muted', col: 2, row: 2 }
	],
	edges: [
		{ from: 'fs', to: 'composite', flow: true },
		{ from: 'composite', to: 'state', dashed: true, label: '/scratch' },
		{ from: 'composite', to: 'store', dashed: true, label: '/memories' }
	]
};

/** Compaction before/after. */
export const compaction: DiagramSpec = {
	title: 'Context compaction',
	caption: 'When the window fills: evict bulky tool results, summarize old turns, keep the tail.',
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
		{ from: 'big', to: 'evict', dashed: true },
		{ from: 'big', to: 'summ', dashed: true },
		{ from: 'evict', to: 'small', flow: true },
		{ from: 'summ', to: 'small', flow: true }
	]
};

/** Skills progressive disclosure. */
export const skillsDisclosure: DiagramSpec = {
	title: 'Progressive disclosure',
	caption: 'Only skill names and one-line descriptions ship in the prompt; bodies load on demand.',
	cols: 2,
	rows: 3,
	shape: 'portrait',
	nodes: [
		{ id: 'prompt', label: 'system prompt', sub: 'names + descriptions', icon: 'list', kind: 'accent', col: 0, row: 0, cspan: 2 },
		{ id: 'load', label: 'load_skill(name)', sub: 'when relevant', icon: 'sparkle', kind: 'ghost', col: 0, row: 1, cspan: 2 },
		{ id: 'body', label: 'full SKILL.md', sub: 'returned as a tool result', icon: 'book', kind: 'muted', col: 0, row: 2, cspan: 2 }
	],
	edges: [
		{ from: 'prompt', to: 'load', flow: true, label: 'pick' },
		{ from: 'load', to: 'body', dashed: true, label: 'expand' }
	]
};

/** Subagent isolation. */
export const subagentIsolation: DiagramSpec = {
	title: 'Subagent isolation',
	caption: 'task() spawns a subagent with its own context; only the final report comes back.',
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
		{ from: 'parent', to: 'task', flow: true },
		{ from: 'task', to: 'sub', dashed: true, label: 'prompt' },
		{ from: 'sub', to: 'report', flow: true },
		{ from: 'report', to: 'parent', label: 'summary' }
	]
};
