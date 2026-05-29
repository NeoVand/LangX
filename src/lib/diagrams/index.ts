import type { DiagramSpec } from './types';

/** Phase 1 · LCEL pipeline: prompt | model | parser. */
export const lcelPipeline: DiagramSpec = {
	width: 640,
	height: 120,
	caption: 'LCEL: each Runnable pipes its output into the next',
	nodes: [
		{ id: 'in', label: 'input', x: 60, y: 60, w: 90, kind: 'start' },
		{ id: 'prompt', label: 'PromptTemplate', x: 210, y: 60, w: 130 },
		{ id: 'model', label: 'ChatModel', x: 360, y: 60, w: 120, kind: 'accent' },
		{ id: 'parser', label: 'OutputParser', x: 510, y: 60, w: 120 },
		{ id: 'out', label: 'output', x: 610, y: 60, w: 70, kind: 'end' }
	],
	edges: [
		{ from: 'in', to: 'prompt' },
		{ from: 'prompt', to: 'model' },
		{ from: 'model', to: 'parser' },
		{ from: 'parser', to: 'out' }
	]
};

/** Phase 1 · the ReAct loop behind create_agent. */
export const reactLoop: DiagramSpec = {
	width: 520,
	height: 200,
	caption: 'create_agent: loop until the model stops requesting tools',
	nodes: [
		{ id: 'start', label: 'START', x: 70, y: 100, w: 80, kind: 'start' },
		{ id: 'agent', label: 'agent', x: 240, y: 100, w: 120, kind: 'accent', sub: 'call model' },
		{ id: 'tools', label: 'tools', x: 240, y: 175, w: 120, sub: 'run tool calls' },
		{ id: 'end', label: 'END', x: 440, y: 100, w: 80, kind: 'end' }
	],
	edges: [
		{ from: 'start', to: 'agent' },
		{ from: 'agent', to: 'end', label: 'no tool calls' },
		{ from: 'agent', to: 'tools', label: 'tool calls' },
		{ from: 'tools', to: 'agent', curve: 'under', label: 'results' }
	]
};

/** Phase 1 · RAG read path. */
export const ragFlow: DiagramSpec = {
	width: 640,
	height: 150,
	caption: 'RAG: embed → retrieve nearest chunks → generate a grounded answer',
	nodes: [
		{ id: 'q', label: 'query', x: 60, y: 50, w: 90, kind: 'start' },
		{ id: 'embed', label: 'embed', x: 200, y: 50, w: 110 },
		{ id: 'store', label: 'vector store', x: 200, y: 120, w: 120, kind: 'muted' },
		{ id: 'retrieve', label: 'top-k search', x: 370, y: 50, w: 130, kind: 'accent' },
		{ id: 'model', label: 'LLM + context', x: 540, y: 50, w: 130 },
		{ id: 'a', label: 'answer', x: 590, y: 120, w: 90, kind: 'end' }
	],
	edges: [
		{ from: 'q', to: 'embed' },
		{ from: 'embed', to: 'retrieve' },
		{ from: 'store', to: 'retrieve', dashed: true, label: 'index' },
		{ from: 'retrieve', to: 'model', label: 'chunks' },
		{ from: 'model', to: 'a' }
	]
};

/** Phase 2 · StateGraph triad: state, nodes, edges. */
export const stateGraphTriad: DiagramSpec = {
	width: 560,
	height: 190,
	caption: 'A StateGraph: nodes transform shared state along edges',
	nodes: [
		{ id: 'start', label: 'START', x: 70, y: 95, w: 80, kind: 'start' },
		{ id: 'n1', label: 'node A', x: 230, y: 95, w: 110, kind: 'accent' },
		{ id: 'n2', label: 'node B', x: 400, y: 95, w: 110, kind: 'accent' },
		{ id: 'end', label: 'END', x: 520, y: 95, w: 70, kind: 'end' },
		{ id: 'state', label: 'shared state', x: 315, y: 170, w: 150, kind: 'muted', sub: 'reducers merge updates' }
	],
	edges: [
		{ from: 'start', to: 'n1' },
		{ from: 'n1', to: 'n2' },
		{ from: 'n2', to: 'end' },
		{ from: 'n1', to: 'state', dashed: true },
		{ from: 'n2', to: 'state', dashed: true }
	]
};

/** Phase 2 · conditional edges (router). */
export const conditionalEdges: DiagramSpec = {
	width: 560,
	height: 230,
	caption: 'A router function picks the next node from the state',
	nodes: [
		{ id: 'classify', label: 'classify', x: 110, y: 110, w: 120, kind: 'accent' },
		{ id: 'route', label: 'router', x: 280, y: 110, w: 90, kind: 'ghost', sub: 'fn(state)' },
		{ id: 'billing', label: 'billing', x: 450, y: 50, w: 110 },
		{ id: 'tech', label: 'technical', x: 450, y: 110, w: 110 },
		{ id: 'general', label: 'general', x: 450, y: 170, w: 110 }
	],
	edges: [
		{ from: 'classify', to: 'route' },
		{ from: 'route', to: 'billing', dashed: true },
		{ from: 'route', to: 'tech', dashed: true },
		{ from: 'route', to: 'general', dashed: true }
	]
};

/** Phase 2 · checkpointer / threads. */
export const checkpointer: DiagramSpec = {
	width: 560,
	height: 170,
	caption: 'Checkpointers persist state per thread after every superstep',
	nodes: [
		{ id: 's1', label: 'step 1', x: 90, y: 60, w: 90, kind: 'accent' },
		{ id: 's2', label: 'step 2', x: 250, y: 60, w: 90, kind: 'accent' },
		{ id: 's3', label: 'step 3', x: 410, y: 60, w: 90, kind: 'accent' },
		{ id: 'cp', label: 'checkpointer', x: 250, y: 135, w: 200, kind: 'muted', sub: 'thread_id keyed snapshots' }
	],
	edges: [
		{ from: 's1', to: 's2' },
		{ from: 's2', to: 's3' },
		{ from: 's1', to: 'cp', dashed: true },
		{ from: 's2', to: 'cp', dashed: true },
		{ from: 's3', to: 'cp', dashed: true }
	]
};

/** Phase 2 · interrupt / resume sequence. */
export const interruptResume: DiagramSpec = {
	width: 600,
	height: 150,
	caption: 'interrupt() pauses the graph; Command({ resume }) continues it',
	nodes: [
		{ id: 'run', label: 'node runs', x: 90, y: 70, w: 120, kind: 'accent' },
		{ id: 'pause', label: 'interrupt()', x: 270, y: 70, w: 120, kind: 'end', sub: 'graph pauses' },
		{ id: 'human', label: 'human decides', x: 270, y: 130, w: 140, kind: 'ghost' },
		{ id: 'resume', label: 'resume', x: 470, y: 70, w: 120, kind: 'start' }
	],
	edges: [
		{ from: 'run', to: 'pause' },
		{ from: 'pause', to: 'human', dashed: true },
		{ from: 'human', to: 'resume', dashed: true, label: 'Command' },
		{ from: 'pause', to: 'resume', label: 'on approve' }
	]
};

/** Phase 2 · Send fan-out (map-reduce). */
export const sendFanout: DiagramSpec = {
	width: 560,
	height: 230,
	caption: 'Send dispatches one worker invocation per item, then fans in',
	nodes: [
		{ id: 'map', label: 'map', x: 90, y: 110, w: 90, kind: 'accent' },
		{ id: 'w1', label: 'worker', x: 290, y: 50, w: 110 },
		{ id: 'w2', label: 'worker', x: 290, y: 110, w: 110 },
		{ id: 'w3', label: 'worker', x: 290, y: 170, w: 110 },
		{ id: 'reduce', label: 'reduce', x: 470, y: 110, w: 100, kind: 'end' }
	],
	edges: [
		{ from: 'map', to: 'w1', dashed: true, label: 'Send' },
		{ from: 'map', to: 'w2', dashed: true },
		{ from: 'map', to: 'w3', dashed: true },
		{ from: 'w1', to: 'reduce' },
		{ from: 'w2', to: 'reduce' },
		{ from: 'w3', to: 'reduce' }
	]
};

/** Phase 2 · subgraph composition. */
export const subgraphs: DiagramSpec = {
	width: 560,
	height: 190,
	caption: 'A compiled graph can be a node inside another graph',
	nodes: [
		{ id: 'start', label: 'START', x: 70, y: 95, w: 80, kind: 'start' },
		{ id: 'outer', label: 'parent node', x: 230, y: 95, w: 130 },
		{ id: 'sub', label: 'subgraph', x: 410, y: 95, w: 120, kind: 'accent', sub: 'its own state' },
		{ id: 'end', label: 'END', x: 520, y: 95, w: 70, kind: 'end' }
	],
	edges: [
		{ from: 'start', to: 'outer' },
		{ from: 'outer', to: 'sub' },
		{ from: 'sub', to: 'end' }
	]
};

/** Phase 3 · harness layers. */
export const harnessLayers: DiagramSpec = {
	width: 560,
	height: 210,
	caption: 'The harness system prompt: BASE → MIDDLEWARE → USER',
	nodes: [
		{ id: 'base', label: 'BASE prompt', x: 280, y: 45, w: 260, kind: 'muted', sub: 'plan · files · delegate' },
		{ id: 'mid', label: 'MIDDLEWARE', x: 280, y: 110, w: 320, kind: 'accent', sub: 'todos · fs · skills · subagents' },
		{ id: 'user', label: 'USER instructions', x: 280, y: 175, w: 220, sub: 'your policy' }
	],
	edges: [
		{ from: 'base', to: 'mid' },
		{ from: 'mid', to: 'user' }
	]
};

/** Phase 3 · backends routing. */
export const backends: DiagramSpec = {
	width: 560,
	height: 200,
	caption: 'CompositeBackend routes paths to State or Store backends',
	nodes: [
		{ id: 'fs', label: 'filesystem tools', x: 110, y: 100, w: 150, kind: 'accent' },
		{ id: 'composite', label: 'CompositeBackend', x: 300, y: 100, w: 160, kind: 'ghost', sub: 'prefix match' },
		{ id: 'state', label: 'StateBackend', x: 480, y: 50, w: 130, kind: 'muted', sub: 'ephemeral' },
		{ id: 'store', label: 'StoreBackend', x: 480, y: 150, w: 130, kind: 'muted', sub: '/memories/ · durable' }
	],
	edges: [
		{ from: 'fs', to: 'composite' },
		{ from: 'composite', to: 'state', dashed: true, label: '/scratch/' },
		{ from: 'composite', to: 'store', dashed: true, label: '/memories/' }
	]
};

/** Phase 3 · compaction before/after. */
export const compaction: DiagramSpec = {
	width: 560,
	height: 200,
	caption: 'Compaction: evict large results, summarize old turns, keep the tail',
	nodes: [
		{ id: 'big', label: 'long history', x: 110, y: 100, w: 140, kind: 'muted', sub: 'over budget' },
		{ id: 'evict', label: 'evict', x: 290, y: 50, w: 100 },
		{ id: 'summ', label: 'summarize', x: 290, y: 150, w: 120 },
		{ id: 'small', label: 'compact context', x: 470, y: 100, w: 150, kind: 'accent', sub: 'under budget' }
	],
	edges: [
		{ from: 'big', to: 'evict', dashed: true },
		{ from: 'big', to: 'summ', dashed: true },
		{ from: 'evict', to: 'small' },
		{ from: 'summ', to: 'small' }
	]
};

/** Phase 3 · skills progressive disclosure. */
export const skillsDisclosure: DiagramSpec = {
	width: 560,
	height: 180,
	caption: 'Only names + descriptions ship; bodies load on demand',
	nodes: [
		{ id: 'prompt', label: 'system prompt', x: 120, y: 90, w: 150, kind: 'accent', sub: 'names only' },
		{ id: 'load', label: 'load_skill(name)', x: 310, y: 90, w: 150, kind: 'ghost' },
		{ id: 'body', label: 'full SKILL.md body', x: 480, y: 90, w: 160, kind: 'muted', sub: 'tool result' }
	],
	edges: [
		{ from: 'prompt', to: 'load', label: 'when relevant' },
		{ from: 'load', to: 'body', dashed: true }
	]
};

/** Phase 3 · subagent isolation. */
export const subagentIsolation: DiagramSpec = {
	width: 560,
	height: 210,
	caption: 'task() spawns an isolated subagent; only its report returns',
	nodes: [
		{ id: 'parent', label: 'parent agent', x: 110, y: 105, w: 140, kind: 'accent' },
		{ id: 'task', label: 'task()', x: 290, y: 105, w: 90, kind: 'ghost' },
		{ id: 'sub', label: 'subagent', x: 460, y: 60, w: 130, sub: 'own context' },
		{ id: 'report', label: 'report', x: 460, y: 160, w: 110, kind: 'end' }
	],
	edges: [
		{ from: 'parent', to: 'task' },
		{ from: 'task', to: 'sub', dashed: true, label: 'prompt' },
		{ from: 'sub', to: 'report' },
		{ from: 'report', to: 'parent', curve: 'under', label: 'summary only' }
	]
};
