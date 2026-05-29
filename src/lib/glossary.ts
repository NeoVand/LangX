export interface GlossaryEntry {
	term: string;
	short: string;
	long: string;
	chapter: 'langchain' | 'langgraph' | 'deepagents' | 'general';
}

/** Case-insensitive lookup; optional aliases map informal names to canonical terms. */
const aliases: Record<string, string> = {
	react: 'ReAct',
	tools: 'tool',
	chains: 'chain',
	prompts: 'prompt',
	models: 'model',
	parsers: 'parser',
	agents: 'agent',
	nodes: 'node',
	edges: 'edge',
	checkpoints: 'checkpoint',
	threads: 'thread',
	schemas: 'schema',
	embeddings: 'embedding',
	retrievers: 'retriever',
	reducers: 'reducer',
	subgraphs: 'subgraph',
	subagents: 'subagent',
	skills: 'skill',
	runnables: 'Runnable',
	lcel: 'LCEL',
	rag: 'RAG',
	mcp: 'MCP',
	hitl: 'HITL',
	store: 'Store',
	'prompt template': 'Prompt template',
	'state graph': 'StateGraph',
	'structured output': 'Structured output',
	'tool calling': 'Tool calling',
	'function calling': 'Function calling',
	'vector store': 'Vector store',
	'context window': 'Context window',
	'map-reduce': 'Map-reduce',
	'time travel': 'Time travel',
	'progressive disclosure': 'Progressive disclosure',
	'context compaction': 'Context compaction',
	'virtual filesystem': 'Virtual filesystem',
	'scoped interpreter': 'Scoped interpreter',
	'needle-in-a-haystack': 'Needle-in-a-haystack',
	'goal drift': 'Goal drift',
	'long-horizon': 'Long-horizon',
	pipe: 'pipe',
	'.pipe()': 'pipe',
	ainvoke: 'ainvoke',
	astream: 'astream',
	abatch: 'abatch',
	astreamevents: 'astreamEvents',
	withconfig: 'withConfig',
	withretry: 'withRetry',
	withstructuredoutput: 'withStructuredOutput',
	addnode: 'addNode',
	addedge: 'addEdge',
	addconditionaledges: 'addConditionalEdges',
	createreactagent: 'createReactAgent',
	createdeepagent: 'createDeepAgent',
	getgraphasync: 'getGraphAsync',
	drawmermaid: 'drawMermaid',
	stringoutputparser: 'StringOutputParser',
	chatprompttemplate: 'ChatPromptTemplate',
	humanmessage: 'HumanMessage',
	aimessage: 'AIMessage',
	toolmessage: 'ToolMessage',
	systemmessage: 'SystemMessage',
	read_file: 'read_file',
	write_file: 'write_file',
	edit_file: 'edit_file',
	interrupt: 'Interrupt',
	'__interrupt__': '__interrupt__',
	tool_calls: 'tool_calls',
	tool_call_id: 'tool_call_id',
	runnablesequence: 'RunnableSequence',
	runnablelambda: 'RunnableLambda',
	chatpromptvalue: 'ChatPromptValue',
	outputparser: 'OutputParser',
	inmemoryvectorstore: 'InMemoryVectorStore',
	similaritysearch: 'similaritySearch',
	recursivecharactertextsplitter: 'RecursiveCharacterTextSplitter',
	chunkoverlap: 'chunkOverlap',
	chunksize: 'chunkSize',
	messagesplaceholder: 'MessagesPlaceholder',
	langgraph_node: 'langgraph_node',
	chatgenerationchunk: 'ChatGenerationChunk',
	recursionlimit: 'recursionLimit',
	'annotation.root': 'Annotation.Root',
	deepagentstate: 'DeepAgentState',
	virtualfile: 'VirtualFile',
	subagentreport: 'SubAgentReport',
	subagentspec: 'SubAgentSpec',
	summarizationevent: 'SummarizationEvent',
	compactionconfig: 'CompactionConfig',
	maxtokens: 'maxTokens',
	evictthresholdpct: 'evictThresholdPct',
	summarizethresholdpct: 'summarizeThresholdPct',
	largetoolresultmin: 'largeToolResultMin',
	historykeep: 'historyKeep',
	compileddeepagent: 'CompiledDeepAgent',
	harnessinterrupt: 'HarnessInterrupt',
	maxiterations: 'maxIterations',
	memorysummary: 'memorySummary',
	observableplot: 'Observable Plot',
	jssandbox: 'JsSandbox',
	'web worker': 'Web Worker',
	'webgpu': 'WebGPU',
	'webassembly': 'WebAssembly',
	'transformers.js': 'Transformers.js',
	'api key': 'API key',
	localstorage: 'localStorage',
	getmodel: 'getModel',
	makeembeddings: 'makeEmbeddings',
	dangerouslyallowbrowser: 'dangerouslyAllowBrowser',
	langsmith: 'LangSmith',
	indexeddb: 'IndexedDB',
	openaiembeddings: 'OpenAIEmbeddings',
	voyageembeddings: 'VoyageEmbeddings',
	chatanthropic: 'ChatAnthropic',
	chatopenai: 'ChatOpenAI',
	chatgroq: 'ChatGroq',
	postgressaver: 'PostgresSaver',
	'skill.md': 'SKILL.md',
	'agents.md': 'AGENTS.md',
	'tools.json': 'tools.json',
	'managed deep agents': 'Managed Deep Agents',
	filesystembackend: 'FilesystemBackend',
	localshellbackend: 'LocalShellBackend',
	'hybrid search': 'hybrid search',
	'embedding model': 'embedding model',
	'agentic grade': 'Agentic grade',
	'context quarantine': 'context quarantine',
	'checkpoint values': 'checkpoint values',
	'checkpoint next': 'checkpoint next',
	'first-match-wins': 'first-match-wins',
	compositeroute: 'CompositeRoute',
	conversation_history: 'conversation_history',
	large_tool_results: 'large_tool_results',
	evictlargetoolresults: 'evictLargeToolResults',
	truncaterepeatedarguments: 'truncateRepeatedArguments',
	summarizeolder: 'summarizeOlder',
	delete_file: 'delete_file',
	on_chat_model_stream: 'on_chat_model_stream',
	on_chat_model_start: 'on_chat_model_start',
	on_chat_model_end: 'on_chat_model_end',
	on_chain_start: 'on_chain_start',
	on_chain_end: 'on_chain_end',
	on_parser_end: 'on_parser_end',
	approve_draft: 'approve_draft',
	fetch_chunk: 'fetch_chunk',
	traceevent: 'TraceEvent'
};

export const glossary: GlossaryEntry[] = [
	// ── General ─────────────────────────────────────────────────────────────
	{
		term: 'Agent Protocol',
		chapter: 'general',
		short: 'Standard for async parent↔subagent communication.',
		long: 'Lets a parent delegate work without blocking on the child transcript; the parent receives a final report when the subagent finishes. Referenced in the Beyond lesson as the production pattern behind task().'
	},
	{
		term: 'Capstone',
		chapter: 'general',
		short: 'End-of-chapter project wiring many harness pieces together.',
		long: 'Research capstone: plan → delegate subagents → publish to /memories/. Data-science capstone: CSV → scoped Worker compute → plot → markdown report. Both run real models against the full Deep Agent harness.'
	},
	{
		term: 'Context',
		chapter: 'general',
		short: 'Everything the model sees in one invocation.',
		long: 'System prompt + message history + tool results. Compaction, virtual files, and subagents exist to keep this under the context window without losing task-critical facts.'
	},
	{
		term: 'Context window',
		chapter: 'general',
		short: 'Maximum tokens visible to the model per call.',
		long: 'Long-horizon runs fill this budget fast. Eviction, summarization, argument truncation, and subagent isolation are the four levers LangX teaches for staying inside it.'
	},
	{
		term: 'Function calling',
		chapter: 'general',
		short: 'Provider API for models to request executable functions.',
		long: 'OpenAI/Anthropic name for tool calling: the model emits structured `{ name, args }` calls; your runtime executes them and returns results as ToolMessages.'
	},
	{
		term: 'HITL',
		chapter: 'general',
		short: 'Human-in-the-loop — pause, review, resume.',
		long: 'Graph or harness pauses at a sensitive step, surfaces proposed tool args to a human, and continues only after approve/edit/reject via Command({ resume }). Deep Agents uses interruptOn; LangGraph uses interrupt().'
	},
	{
		term: 'JSON schema',
		chapter: 'general',
		short: 'Machine-readable shape description for JSON objects.',
		long: 'Zod schemas compile to JSON Schema for the model API. Used for tool argument contracts and withStructuredOutput constraints — the bridge between TypeScript types and model behavior.'
	},
	{
		term: 'LLM',
		chapter: 'general',
		short: 'Large language model — the generative core.',
		long: 'Neural network trained to predict text; in LangX it drives explanation, classification, tool selection, routing, and summarization. Token cost and latency shape every architectural choice in the course.'
	},
	{
		term: 'Long-horizon',
		chapter: 'general',
		short: 'Tasks spanning many steps and large accumulated context.',
		long: 'Research reports, multi-file edits, or pipelines running minutes with dozens of tool calls. Phase 3 exists because short chat loops break here without planning, files, compaction, and delegation.'
	},
	{
		term: 'Message',
		chapter: 'general',
		short: 'One turn in chat history (human, AI, tool, or system).',
		long: 'LangChain messages (HumanMessage, AIMessage, ToolMessage, SystemMessage) accumulate in graph state. Agents loop by appending tool results and re-invoking the model on the growing list.'
	},
	{
		term: 'Sandbox',
		chapter: 'general',
		short: 'Isolated execution environment for agent code.',
		long: 'Production sandboxes are remote VMs (Modal, Daytona, Runloop). LangX uses a scoped JS Worker — no DOM, filesystem, or network — as a browser-safe stand-in for compute and plotting demos.'
	},
	{
		term: 'Temperature',
		chapter: 'general',
		short: 'Sampling randomness (0 ≈ deterministic).',
		long: 'Lower temperature → steadier outputs for classification and extraction; higher → more varied prose. Passed via model config or withConfig on any Runnable.'
	},
	{
		term: 'Token',
		chapter: 'general',
		short: 'Smallest unit the model reads or generates.',
		long: 'Roughly ¾ of an English word. Token counts drive cost, latency, and context limits — LangX compaction demos track live usage against eviction and summarization thresholds.'
	},
	{
		term: 'Tool calling',
		chapter: 'general',
		short: 'Model emits structured function calls instead of plain text.',
		long: 'After bindTools, the model responds with tool_calls (name + JSON args). Runtime executes each call, returns ToolMessages, and re-invokes — the control loop behind every agent in LangX.'
	},

	// ── LangChain ───────────────────────────────────────────────────────────
	{
		term: 'Agent',
		chapter: 'langchain',
		short: 'Model plus tools in a loop until it stops calling tools.',
		long: 'Repeatedly: call model → execute tool_calls → append ToolMessages → call model again. create_agent / createReactAgent compiles this to a LangGraph with agent and tools nodes.'
	},
	{
		term: 'bindTools',
		chapter: 'langchain',
		short: 'Attach tool definitions to a chat model.',
		long: 'model.bindTools([weather, calc]) lets the model respond with tool_calls. You must execute calls and feed ToolMessages back — bindTools alone does not run anything.'
	},
	{
		term: 'Chain',
		chapter: 'langchain',
		short: 'Composed sequence of Runnables wired with .pipe().',
		long: 'Typically prompt → model → parser. Lazy: nothing runs until invoke, stream, or batch. The pipe operator (LCEL) is syntactic sugar for RunnableSequence.'
	},
	{
		term: 'Chunk',
		chapter: 'langchain',
		short: 'One slice of a document for retrieval.',
		long: 'Long docs are split before embedding. Size and overlap trade off precision vs context — too large dilutes relevance; too small loses meaning across chunk boundaries.'
	},
	{
		term: 'Cosine similarity',
		chapter: 'langchain',
		short: 'Embedding alignment score (−1 to 1).',
		long: 'Higher score = query and chunk vectors point the same direction. LangX RAG demo surfaces raw cosine values so you can debug ranker quality before blaming the LLM.'
	},
	{
		term: 'create_agent',
		chapter: 'langchain',
		short: 'LangChain v1 factory for a ReAct agent graph.',
		long: 'Wraps model + tools into a compiled LangGraph. In JS the prebuilt equivalent is createReactAgent from @langchain/langgraph/prebuilt.'
	},
	{
		term: 'Embedding',
		chapter: 'langchain',
		short: 'Numeric vector representing text meaning.',
		long: 'Models like MiniLM map text to fixed-length vectors; similar meaning → nearby vectors. Queries and documents embed separately, then rank by distance at search time.'
	},
	{
		term: 'invoke',
		chapter: 'langchain',
		short: 'Run a Runnable once; return final output.',
		long: 'chain.invoke(input) executes the full pipeline and returns the last step result. Simplest mode — no incremental tokens or per-step events.'
	},
	{
		term: 'batch',
		chapter: 'langchain',
		short: 'Run many inputs through one Runnable in parallel.',
		long: 'chain.batch([a, b, c]) applies the same pipeline concurrently — useful for bulk classification, embedding jobs, or eval sweeps.'
	},
	{
		term: 'LCEL',
		chapter: 'langchain',
		short: 'LangChain Expression Language — pipe-based composition.',
		long: 'a.pipe(b).pipe(c) or prompt | model | parser builds a RunnableSequence declaratively. Lazy until invoke/stream/batch; every Runnable in the chain shares the same protocol.'
	},
	{
		term: 'Lazy evaluation',
		chapter: 'langchain',
		short: 'Chains do nothing until explicitly invoked.',
		long: 'Building prompt | model | parser constructs a plan, not a result. Only invoke(), stream(), or batch() triggers LLM calls — safe to define pipelines at import time.'
	},
	{
		term: 'Model',
		chapter: 'langchain',
		short: 'LLM wrapper: messages in, AIMessage out.',
		long: 'Chat models (ChatAnthropic, ChatOpenAI) accept message lists and return completions. Bind tools, structured-output schemas, retries, or config (temperature, maxTokens) via Runnable helpers.'
	},
	{
		term: 'Parser',
		chapter: 'langchain',
		short: 'Converts raw model output to a typed value.',
		long: 'StringOutputParser extracts text from an AIMessage. Structured parsers use withStructuredOutput to force Zod-typed JSON instead of free-form prose.'
	},
	{
		term: 'Prompt',
		chapter: 'langchain',
		short: 'Text or template fed to the model before generation.',
		long: 'System instruction, user question, or templated string with {variables}. ChatPromptTemplate turns structured inputs into role-tagged message lists the model understands.'
	},
	{
		term: 'Prompt template',
		chapter: 'langchain',
		short: 'Reusable prompt with {placeholder} slots.',
		long: 'ChatPromptTemplate.fromMessages([...]) defines system/human/ai patterns filled at invoke time — separates prompt design from runtime data.'
	},
	{
		term: 'RAG',
		chapter: 'langchain',
		short: 'Retrieval-augmented generation.',
		long: 'Embed query → search vector store → inject top-k chunks into prompt → generate grounded answer. Most RAG failures are retrieval failures, not generation failures.'
	},
	{
		term: 'ReAct',
		chapter: 'langchain',
		short: 'Reason + Act: model thinks, calls tools, repeats.',
		long: 'Minimal agent loop: call model → if tool_calls, execute → append results → call model until no tools remain. createReactAgent implements exactly this two-node graph.'
	},
	{
		term: 'Retriever',
		chapter: 'langchain',
		short: 'Fetches relevant documents for a query.',
		long: 'Embeds the query, searches the vector index, returns top-k chunks. Deterministic and testable — tune chunking and embeddings here before touching the LLM.'
	},
	{
		term: 'Runnable',
		chapter: 'langchain',
		short: 'Anything with invoke / stream / batch.',
		long: 'Unified protocol wrapping prompts, models, parsers, retrievers, and tools. Composable with pipe; the substrate LangGraph nodes and Deep Agent middleware both sit on.'
	},
	{
		term: 'RunnableParallel',
		chapter: 'langchain',
		short: 'Fan one input to multiple Runnables; gather keyed results.',
		long: 'RunnableParallel.from({ short: chainA, bullets: chainB }) runs branches concurrently and returns { short, bullets }. Pair with RunnablePassthrough to keep the original input.'
	},
	{
		term: 'RunnablePassthrough',
		chapter: 'langchain',
		short: 'Runnable that forwards input unchanged.',
		long: 'Identity step in parallel fan-outs — passes the original dict through while sibling branches transform copies. Common in map-style RunnableParallel graphs.'
	},
	{
		term: 'Schema',
		chapter: 'langchain',
		short: 'Typed contract for structured model output.',
		long: 'In LangX, Zod objects with fields, enums, and constraints. withStructuredOutput(schema) registers it as a tool so the model must fill the record — no regex parsing.'
	},
	{
		term: 'stream',
		chapter: 'langchain',
		short: 'Yield output chunks as the Runnable produces them.',
		long: 'chain.stream(input) returns an async iterator — typically token-by-token text for responsive chat UIs. Graphs use streamMode for values, updates, or messages.'
	},
	{
		term: 'streamEvents',
		chapter: 'langchain',
		short: 'Emit typed events at every Runnable boundary.',
		long: 'chain.streamEvents(input, { version: "v2" }) yields on_chat_model_stream, on_parser_end, etc. — ideal for debug panels, audit logs, and the streaming lesson Demo 2.'
	},
	{
		term: 'Structured output',
		chapter: 'langchain',
		short: 'Force JSON matching a schema, not free text.',
		long: 'Declare Zod schema → withStructuredOutput → typed object returned. Provider tool-calling API constrains shape; you skip fragile post-hoc parsing.'
	},
	{
		term: 'tool',
		chapter: 'langchain',
		short: 'Typed function the model may call by name.',
		long: 'tool(fn, { name, description, schema }) exposes JSON schema to the model. Runtime executes fn(args) and returns a ToolMessage so the model can continue reasoning.'
	},
	{
		term: 'Top-k',
		chapter: 'langchain',
		short: 'Return the k highest-scoring retrieval hits.',
		long: 'After embedding search, keep only the k nearest chunks. Too small → miss context; too large → noise and token bloat in the prompt.'
	},
	{
		term: 'Vector store',
		chapter: 'langchain',
		short: 'Index of embedded chunks for similarity search.',
		long: 'Stores (vector, text, metadata) tuples. LangX uses in-memory search; production uses pgvector, Pinecone, or Chroma. Query embedding → nearest neighbours → context.'
	},
	{
		term: 'withStructuredOutput',
		chapter: 'langchain',
		short: 'Wrap model to return a Zod-typed object.',
		long: 'model.withStructuredOutput(BugReportSchema) registers schema as a tool and returns z.infer<typeof BugReport> directly — the structured-output lesson centerpiece.'
	},
	{
		term: 'Zod',
		chapter: 'langchain',
		short: 'TypeScript schema library for tools and structured output.',
		long: 'z.object, z.enum, z.array, etc. compile to JSON Schema for the model and back to validated TS values on return. Used in every tool() and withStructuredOutput demo.'
	},

	// ── LangGraph ───────────────────────────────────────────────────────────
	{
		term: 'add_messages',
		chapter: 'langgraph',
		short: 'Reducer that appends messages instead of replacing.',
		long: 'When two nodes return { messages: [msg] }, add_messages concatenates both. Without it, default last-write-wins drops chat history on concurrent updates.'
	},
	{
		term: 'Annotation',
		chapter: 'langgraph',
		short: 'Helper for typed state fields and reducers.',
		long: 'Annotation<string>() or Annotation<T[]>({ reducer, default }) declares field type and merge semantics. Annotation.Root({...}) builds the full state schema.'
	},
	{
		term: 'Checkpoint',
		chapter: 'langgraph',
		short: 'Saved graph state snapshot after one superstep.',
		long: 'Records values (state), next (pending nodes), checkpoint_id, and metadata. Checkpointers write one after every node completes — basis for resume, replay, and time travel.'
	},
	{
		term: 'Checkpointer',
		chapter: 'langgraph',
		short: 'Persists a checkpoint after every graph step.',
		long: 'Plug into compile({ checkpointer }). Enables crash recovery, thread history, human-in-the-loop pauses, and fork-from-past-step debugging.'
	},
	{
		term: 'Command',
		chapter: 'langgraph',
		short: 'Resume payload for interrupted or forked runs.',
		long: 'new Command({ resume: humanDecision }) continues from interrupt() or applies HITL approve/edit/reject. Also used after updateState forks.'
	},
	{
		term: 'compile',
		chapter: 'langgraph',
		short: 'Turn StateGraph builder into executable graph.',
		long: '.compile({ checkpointer }) produces the runnable supporting invoke, stream, getStateHistory, and interrupt. Required once after all nodes and edges are registered.'
	},
	{
		term: 'Conditional edge',
		chapter: 'langgraph',
		short: 'Router picks next node from current state.',
		long: 'addConditionalEdges("classify", (s) => s.category, { billing: "billing", ... }) — router returns a key; runtime follows the matching edge. Powers triage and tool-routing agents.'
	},
	{
		term: 'Edge',
		chapter: 'langgraph',
		short: 'Fixed transition between two nodes.',
		long: 'addEdge("tools", "agent") always routes tools → agent. Unconditional edges encode deterministic flow; conditional edges delegate routing to a function.'
	},
	{
		term: 'Fan-out',
		chapter: 'langgraph',
		short: 'One node spawns many parallel branches.',
		long: 'Return Send objects from a node — one per work item. Branches run concurrently in the same superstep; reducers merge results before the next round.'
	},
	{
		term: 'getStateHistory',
		chapter: 'langgraph',
		short: 'Async iterator over checkpoints in a thread.',
		long: 'Walks snapshots newest-first for inspection, replay, or fork. Checkpointers lesson uses it to show every superstep the graph took.'
	},
	{
		term: 'Interrupt',
		chapter: 'langgraph',
		short: 'Pause inside a node until host resumes.',
		long: 'interrupt(value) throws a control signal; host receives payload, asks human, then graph.invoke(new Command({ resume })). Turns any node into a wait gate.'
	},
	{
		term: 'Last-write-wins',
		chapter: 'langgraph',
		short: 'Default reducer: newest value overwrites field.',
		long: 'Without explicit reducer, concurrent writes to the same field keep only the last one — wrong for lists. Reducer lesson contrasts this with add_messages and custom merges.'
	},
	{
		term: 'Map-reduce',
		chapter: 'langgraph',
		short: 'Split into parallel branches, merge results.',
		long: 'Plan → N Send branches → reducer concatenates → synthesis node combines. Send fan-out lesson is map-reduce inside a StateGraph.'
	},
	{
		term: 'MemorySaver',
		chapter: 'langgraph',
		short: 'In-memory checkpointer for demos.',
		long: 'new MemorySaver() persists checkpoints in RAM. Production swaps SQLite or Postgres savers; invoke/stream/checkpoint API stays identical.'
	},
	{
		term: 'MessagesAnnotation',
		chapter: 'langgraph',
		short: 'Prebuilt chat state with add_messages reducer.',
		long: 'Standard { messages: BaseMessage[] } schema used in every ReAct loop. Import instead of hand-rolling message list merge logic.'
	},
	{
		term: 'Node',
		chapter: 'langgraph',
		short: 'Named function (state) → partialState update.',
		long: 'Nodes call LLMs, run tools, classify input. Return only changed fields; runtime merges via reducers before the next superstep.'
	},
	{
		term: 'Partial state update',
		chapter: 'langgraph',
		short: 'Subset of state fields a node returns.',
		long: 'Nodes never return full state — e.g. { messages: [newAiMessage] }. Reducers merge partials into the running snapshot.'
	},
	{
		term: 'Pregel',
		chapter: 'langgraph',
		short: 'Bulk-synchronous parallel model for supersteps.',
		long: 'Google Pregel pattern: nodes run concurrently within a superstep, emit updates, runtime merges, next superstep begins. LangGraph runtime is Pregel-flavored.'
	},
	{
		term: 'Reducer',
		chapter: 'langgraph',
		short: 'Merges concurrent updates into one state field.',
		long: 'Default: last-write-wins. Lists usually need concatenation (add_messages). Custom reducers power fan-out merge and concurrent-write demos.'
	},
	{
		term: 'Router',
		chapter: 'langgraph',
		short: 'Function returning next node key from state.',
		long: 'Passed to addConditionalEdges — inspects state (category, score, tool choice) and returns a string key matching a registered edge target.'
	},
	{
		term: 'Send',
		chapter: 'langgraph',
		short: 'Spawn parallel branch with isolated input.',
		long: 'Returned from a node to fan out work; each Send targets a worker node. Results merge via schema reducers in the following superstep.'
	},
	{
		term: 'State',
		chapter: 'langgraph',
		short: 'Typed object flowing through every node.',
		long: 'Shared memory of a graph run — e.g. { messages, count, category }. Each node reads current state and returns partial updates.'
	},
	{
		term: 'State schema',
		chapter: 'langgraph',
		short: 'Type definition + reducer per state field.',
		long: 'Annotation.Root({ field: Annotation<T>({ reducer, default }) }) declares what exists and how concurrent writes combine — the StateGraph lesson triad with nodes and edges.'
	},
	{
		term: 'StateGraph',
		chapter: 'langgraph',
		short: 'Typed state machine of nodes and edges.',
		long: 'Declare schema, register node functions returning partial updates, wire edges and routers, compile. Substrate every Deep Agent and createReactAgent graph runs on.'
	},
	{
		term: 'Store',
		chapter: 'langgraph',
		short: 'Durable key-value store across threads.',
		long: 'LangGraph Store persists arbitrary cross-thread data (memories, profiles). Deep Agents StoreBackend implements filesystem ops on top of a store like IndexedDB/Dexie.'
	},
	{
		term: 'streamMode',
		chapter: 'langgraph',
		short: 'Which projection to stream from a graph run.',
		long: '"values" = full state each superstep; "updates" = per-node deltas; "messages" = per-token LLM chunks with metadata.langgraph_node. Streaming-modes lesson runs all three side by side.'
	},
	{
		term: 'Subgraph',
		chapter: 'langgraph',
		short: 'Compiled graph used as a node in another graph.',
		long: 'Encapsulate a workflow (RAG mini-graph, research pipeline) and drop it in as one step. Runnable at the LangChain layer; subgraph at the LangGraph layer.'
	},
	{
		term: 'Superstep',
		chapter: 'langgraph',
		short: 'One synchronized round of graph execution.',
		long: 'Pregel tick: eligible nodes run concurrently, emit updates, runtime merges reducers, then next superstep. Path observed in demos lists node order per superstep.'
	},
	{
		term: 'Thread',
		chapter: 'langgraph',
		short: 'ID grouping all checkpoints of one conversation.',
		long: 'Pass thread_id in config.configurable on every invoke. Same ID = shared history; different ID = isolated session.'
	},
	{
		term: 'thread_id',
		chapter: 'langgraph',
		short: 'Config key scoping checkpoints to one session.',
		long: '{ configurable: { thread_id: "user-42" } } on invoke/stream. Checkpointers lesson shows two threads with independent histories on one compiled graph.'
	},
	{
		term: 'Time travel',
		chapter: 'langgraph',
		short: 'Replay or fork from an earlier checkpoint.',
		long: 'Pick past checkpoint_id, optionally updateState to edit values, invoke forward from fork — debug "what if we had routed differently?" without rerunning from scratch.'
	},
	{
		term: 'ToolNode',
		chapter: 'langgraph',
		short: 'Prebuilt node executing tool_calls from last AIMessage.',
		long: 'new ToolNode(tools) reads tool_calls, runs matching tools, returns ToolMessages — standard tools node in ReAct graphs alongside the agent node.'
	},
	{
		term: 'updateState',
		chapter: 'langgraph',
		short: 'Edit state at a checkpoint to fork history.',
		long: 'graph.updateState({ checkpoint_id }, { count: 100 }) creates branch; subsequent invoke(null, newConfig) runs forward from fork — time-travel editing.'
	},

	// ── Deep Agents ─────────────────────────────────────────────────────────
	{
		term: 'Argument truncation',
		chapter: 'deepagents',
		short: 'Replace repeated tool args with placeholders.',
		long: 'Compaction tier: identical args across many calls become "<as before>" to save tokens without dropping the fact that the tool ran.'
	},
	{
		term: 'BackendProtocol',
		chapter: 'deepagents',
		short: 'Interface (read/write/list/delete) all FS tools use.',
		long: 'Every filesystem tool routes through the backend — swap StateBackend for CompositeBackend in config; tools never know where bytes live.'
	},
	{
		term: 'CompositeBackend',
		chapter: 'deepagents',
		short: 'Routes paths to different backends by prefix.',
		long: 'Route /memories/ → StoreBackend, everything else → StateBackend. One tool surface; policy decides durability vs scratch space.'
	},
	{
		term: 'Context compaction',
		chapter: 'deepagents',
		short: 'Automatic shrinking of conversation context.',
		long: 'Pipeline: evict large tool blobs to files → truncate redundant args → summarize old turns → overflow recovery if still over budget. Compaction lesson runs all tiers visibly.'
	},
	{
		term: 'createDeepAgent',
		chapter: 'deepagents',
		short: 'Factory assembling full harness from config.',
		long: 'Takes model, backend, permissions, subagents, skills, compaction, interruptOn, etc. Returns compiled graph invokable like any Runnable — harness lesson entry point.'
	},
	{
		term: 'Deep Agent',
		chapter: 'deepagents',
		short: 'LangGraph agent with pre-wired harness middleware.',
		long: 'createDeepAgent output: planning, virtual FS, subagents, skills, compaction, HITL as config — not hand-wired graph plumbing. Phase 3 is policy over this stack.'
	},
	{
		term: 'Dexie',
		chapter: 'deepagents',
		short: 'IndexedDB wrapper for browser StoreBackend.',
		long: 'StoreBackend("my-app") persists /memories/ files across tab reloads via Dexie — in-browser stand-in for Postgres-backed store in production.'
	},
	{
		term: 'Eviction',
		chapter: 'deepagents',
		short: 'Move oversized tool output to a virtual file.',
		long: 'Model sees short preview + path; read_file retrieves full content on demand. First compaction tier before summarization.'
	},
	{
		term: 'Goal drift',
		chapter: 'deepagents',
		short: 'Agent forgets original goal after summarization.',
		long: 'Declares done early or re-asks answered questions — key failure mode the needle-in-a-haystack compaction eval probes for.'
	},
	{
		term: 'Harness',
		chapter: 'deepagents',
		short: 'Opinionated bundle around a bare agent loop.',
		long: 'Pre-wired prompt (BASE + middleware + user), default FS tools, planning, subagents, compaction. You configure policy; you do not rebuild the graph from nodes.'
	},
	{
		term: 'interruptOn',
		chapter: 'deepagents',
		short: 'Tool names requiring human approval before run.',
		long: 'interruptOn: ["write_file"] wraps listed tools in HITL gates — graph pauses, host shows args, resumes with Command({ resume }). HITL lesson toggles this.'
	},
	{
		term: 'load_skill',
		chapter: 'deepagents',
		short: 'Tool fetching a skill full body on demand.',
		long: 'Agent sees only skill names/descriptions in prompt; load_skill("cite") returns full SKILL.md as tool result — progressive disclosure in one call.'
	},
	{
		term: 'MCP',
		chapter: 'deepagents',
		short: 'Model Context Protocol — external tool servers.',
		long: 'Standard plug-in interface for Tavily, Browserbase, etc. Production harnesses attach MCP servers as tool sources; Beyond lesson references the pattern.'
	},
	{
		term: 'Middleware',
		chapter: 'deepagents',
		short: 'Pluggable hooks wrapping the agent loop.',
		long: 'Mutate prompts, register tools, intercept results, summarize history, pause for approval — without rewriting core graph nodes. Harness assembles middleware stack from config.'
	},
	{
		term: 'Needle-in-a-haystack',
		chapter: 'deepagents',
		short: 'Compaction eval: hide fact early, test recall after shrink.',
		long: 'Plant tiny fact in turn 1, force compaction, verify agent still retrieves it from /conversation_history/ or evicted file path.'
	},
	{
		term: 'Overflow recovery',
		chapter: 'deepagents',
		short: 'Fail loudly when context still exceeds maxTokens.',
		long: 'After eviction, arg trim, and summarization — if budget blown, raise error instead of silently dropping system prompt. Last compaction tier.'
	},
	{
		term: 'Permissions',
		chapter: 'deepagents',
		short: 'Declarative allow/deny for filesystem ops.',
		long: 'Rules { operations, paths, mode } evaluated first-match-wins before tool runs. Permissions lesson blocks destructive writes while allowing reads.'
	},
	{
		term: 'Progressive disclosure',
		chapter: 'deepagents',
		short: 'Ship metadata; load full content on demand.',
		long: 'Skills list names + one-liners in prompt; load_skill expands body only when relevant. Keeps prompt small with large addressable catalog.'
	},
	{
		term: 'Scoped interpreter',
		chapter: 'deepagents',
		short: 'In-process JS without DOM, shell, or network.',
		long: 'Web Worker running constrained JS for loops and data transforms. Capstone data-science uses it for compute/plot — stand-in for remote code sandbox.'
	},
	{
		term: 'Skill',
		chapter: 'deepagents',
		short: 'SKILL.md file with on-demand expertise.',
		long: 'Description in system prompt; full markdown body loaded via load_skill when agent decides it is relevant. Skills lesson builds a small catalog.'
	},
	{
		term: 'StateBackend',
		chapter: 'deepagents',
		short: 'Files stored in active graph state.',
		long: 'Ephemeral — scoped to one thread, cleared when session ends. Default scratch space for /notes/ and working files.'
	},
	{
		term: 'StoreBackend',
		chapter: 'deepagents',
		short: 'Files in durable Store across threads.',
		long: 'Backed by IndexedDB (Dexie) in LangX so /memories/ survives reload. Cross-session user memory and capstone publish targets.'
	},
	{
		term: 'Subagent',
		chapter: 'deepagents',
		short: 'Ephemeral child agent with isolated context.',
		long: 'Configured by name, description, prompt, optional tools/model. task() runs to completion, returns one report — parent never sees internal messages.'
	},
	{
		term: 'Summarization',
		chapter: 'deepagents',
		short: 'Replace old history with LLM summary.',
		long: 'Shrinks active context; raw history appended to /conversation_history/ on disk. Risk: goal drift if summary drops task-critical constraints.'
	},
	{
		term: 'task',
		chapter: 'deepagents',
		short: 'Tool spawning a named subagent; returns summary.',
		long: 'task({ subagent: "researcher", description: "..." }) — isolated child run, single concise report back. Subagents lesson and research capstone core delegation primitive.'
	},
	{
		term: 'Virtual filesystem',
		chapter: 'deepagents',
		short: 'Shared workspace the agent reads and writes.',
		long: 'Lives in graph state (StateBackend) or Store by default. Tools: ls, read_file, write_file, edit_file, glob, grep — model thinks in files, not chat-only memory.'
	},
	{
		term: 'write_todos',
		chapter: 'deepagents',
		short: 'Built-in planning tool persisting steps in state.',
		long: 'Agent writes pending/in-progress/done todos to graph state — externalized planning visible in UI. Todos lesson and both capstones depend on it.'
	},

	// ── API keywords · LangChain Runnable surface ───────────────────────────
	{
		term: 'ainvoke',
		chapter: 'langchain',
		short: 'Async Runnable.invoke — await single run.',
		long: 'await chain.ainvoke(input) — non-blocking equivalent of invoke. Use in async handlers, Svelte actions, and server routes when you cannot block the event loop.'
	},
	{
		term: 'abatch',
		chapter: 'langchain',
		short: 'Async Runnable.batch — parallel many inputs.',
		long: 'await chain.abatch([a, b, c]) — async parallel over inputs. Same semantics as batch; preferred inside async/await code paths.'
	},
	{
		term: 'astream',
		chapter: 'langchain',
		short: 'Async Runnable.stream — async chunk iterator.',
		long: 'for await (const chunk of chain.astream(input)) — async token/chunk stream for chat UIs and SSE endpoints without blocking between chunks.'
	},
	{
		term: 'astreamEvents',
		chapter: 'langchain',
		short: 'Async Runnable.streamEvents — async event iterator.',
		long: 'for await (const ev of chain.astreamEvents(input, { version: "v2" })) — async fine-grained trace across every Runnable boundary in the tree.'
	},
	{
		term: 'pipe',
		chapter: 'langchain',
		short: 'Runnable composition: left output → right input.',
		long: 'prompt.pipe(model).pipe(parser) or prompt | model | parser (LCEL). Builds a RunnableSequence lazily; call invoke/stream/batch on the result to execute.'
	},
	{
		term: 'withConfig',
		chapter: 'langchain',
		short: 'Attach runtime config (tags, runName, callbacks) to a Runnable.',
		long: 'model.withConfig({ runName: "model", tags: ["demo"] }) — labels appear in streamEvents and LangSmith traces without changing model weights or prompt.'
	},
	{
		term: 'withRetry',
		chapter: 'langchain',
		short: 'Wrap Runnable with automatic retry on failure.',
		long: 'extractor.withRetry({ stopAfterAttempt: 3 }) — re-invokes on transient provider errors. Structured-output lesson pairs with withStructuredOutput for robust extraction.'
	},
	{
		term: 'StringOutputParser',
		chapter: 'langchain',
		short: 'Parser extracting plain string from AIMessage.',
		long: 'new StringOutputParser() as final chain step — .content string from model output. Runnables and streaming demos: prompt | model | StringOutputParser().'
	},
	{
		term: 'ChatPromptTemplate',
		chapter: 'langchain',
		short: 'Template building role-tagged message lists.',
		long: 'ChatPromptTemplate.fromMessages([["system", "..."], ["human", "{topic}"]]) — invoke fills placeholders → ChatPromptValue → model input.'
	},
	{
		term: 'HumanMessage',
		chapter: 'langchain',
		short: 'Message representing user/human input.',
		long: 'new HumanMessage("text") — role "human" in chat history. Passed to model.invoke([...]) or accumulated in graph state messages[] via add_messages.'
	},
	{
		term: 'AIMessage',
		chapter: 'langchain',
		short: 'Message representing model output.',
		long: 'Returned by model.invoke; may include .content string and/or .tool_calls array. ToolNode reads tool_calls from the latest AIMessage in state.'
	},
	{
		term: 'ToolMessage',
		chapter: 'langchain',
		short: 'Message carrying tool execution result back to model.',
		long: 'new ToolMessage({ content: result, tool_call_id }) — appended after running a tool call so the model can reason on the outcome in the next invoke.'
	},
	{
		term: 'SystemMessage',
		chapter: 'langchain',
		short: 'Message setting model behavior/instructions.',
		long: 'new SystemMessage("You are…") — highest-priority instruction in the message list. Deep Agent harness assembles system content from BASE + middleware + user layers.'
	},
	{
		term: 'createReactAgent',
		chapter: 'langchain',
		short: 'LangGraph prebuilt ReAct agent factory.',
		long: 'createReactAgent({ llm, tools }) from @langchain/langgraph/prebuilt — compiles agent ↔ tools loop graph. Agent lesson uses this; equivalent to create_agent in Python v1.'
	},

	// ── API keywords · LangGraph builder surface ─────────────────────────────
	{
		term: 'addNode',
		chapter: 'langgraph',
		short: 'Register named node function on StateGraph builder.',
		long: 'builder.addNode("agent", agentFn) — agentFn(state) returns partial update. Must call before compile(); node name used in addEdge targets.'
	},
	{
		term: 'addEdge',
		chapter: 'langgraph',
		short: 'Fixed edge from one node to another.',
		long: 'builder.addEdge("tools", "agent") or addEdge(START, "agent") — unconditional transition every time source node completes.'
	},
	{
		term: 'addConditionalEdges',
		chapter: 'langgraph',
		short: 'Router function picks next node from state.',
		long: 'addConditionalEdges("classify", (s) => s.category, { billing: "billing", tech: "tech" }) — router return value selects edge key; powers triage and tool-routing.'
	},
	{
		term: 'START',
		chapter: 'langgraph',
		short: 'Graph entry sentinel node.',
		long: 'addEdge(START, "firstNode") — every compiled graph needs exactly one START edge. Not a user-defined node; runtime constant from @langchain/langgraph.'
	},
	{
		term: 'END',
		chapter: 'langgraph',
		short: 'Graph terminal sentinel node.',
		long: 'addEdge("lastNode", END) — run completes when END is reached. Conditional routers often return END when the agent is done calling tools.'
	},
	{
		term: 'configurable',
		chapter: 'langgraph',
		short: 'Runtime config bag on invoke/stream (thread_id, checkpoint_id).',
		long: 'graph.invoke(input, { configurable: { thread_id: "t1", checkpoint_id: "..." } }) — passed to checkpointer and streaming; scopes persistence and replay.'
	},
	{
		term: 'checkpoint_id',
		chapter: 'langgraph',
		short: 'ID of a specific saved checkpoint in a thread.',
		long: 'In configurable.checkpoint_id — pin replay/fork to exact superstep snapshot. updateState + invoke(null, cfg) resumes from that point in time-travel demos.'
	},
	{
		term: 'getGraphAsync',
		chapter: 'langgraph',
		short: 'Async fetch drawable graph representation.',
		long: 'await compiledGraph.getGraphAsync({ xray: true }) — returns object with drawMermaid(). Powers LangGraphView live diagrams in agent, stategraph, conditional-edges lessons.'
	},
	{
		term: 'drawMermaid',
		chapter: 'langgraph',
		short: 'Emit Mermaid diagram string from drawable graph.',
		long: 'drawable.drawMermaid({ withStyles: false, curveStyle: "linear" }) — LangGraph-native diagram source rendered client-side in LangGraphView.'
	},
	{
		term: 'xray',
		chapter: 'langgraph',
		short: 'getGraphAsync option expanding subgraph nodes inline.',
		long: 'getGraphAsync({ xray: true }) — shows nested subgraph internals in one diagram instead of collapsing them to a single box.'
	},
	{
		term: 'streamMode: values',
		chapter: 'langgraph',
		short: 'Stream full state after each superstep.',
		long: 'graph.stream(input, { streamMode: "values" }) — yields complete state snapshot post-merge; best for UI mirroring entire graph state.'
	},
	{
		term: 'streamMode: updates',
		chapter: 'langgraph',
		short: 'Stream per-node partial updates only.',
		long: 'streamMode: "updates" — yields { nodeName: partialUpdate } deltas; audit trail of who changed what each superstep without full state payload.'
	},
	{
		term: 'streamMode: messages',
		chapter: 'langgraph',
		short: 'Stream LLM token chunks with node metadata.',
		long: 'streamMode: "messages" — yields [ChatGenerationChunk, { langgraph_node }] tuples; token-by-token UI with attribution to which node produced the text.'
	},

	// ── API keywords · Deep Agents filesystem & tools ───────────────────────
	{
		term: 'read_file',
		chapter: 'deepagents',
		short: 'Harness tool: read path from virtual filesystem.',
		long: 'read_file("/notes/plan.md") — routes through active BackendProtocol (State or Store). Eviction leaves preview + path; agent read_file for full blob.'
	},
	{
		term: 'write_file',
		chapter: 'deepagents',
		short: 'Harness tool: create/overwrite file at path.',
		long: 'write_file(path, content) — often behind interruptOn in HITL demos. Permissions lesson may deny writes to protected prefixes.'
	},
	{
		term: 'edit_file',
		chapter: 'deepagents',
		short: 'Harness tool: patch file by search/replace.',
		long: 'edit_file(path, old_string, new_string) — surgical edits without rewriting entire file; common in coding-agent patterns.'
	},
	{
		term: 'ls',
		chapter: 'deepagents',
		short: 'Harness tool: list directory entries.',
		long: 'ls("/") or ls("/memories") — discover virtual FS layout; virtual-fs lesson shows tree after agent writes artifacts.'
	},
	{
		term: 'glob',
		chapter: 'deepagents',
		short: 'Harness tool: match paths by pattern.',
		long: 'glob("**/*.md") — find files by glob pattern across virtual FS without knowing exact paths upfront.'
	},
	{
		term: 'grep',
		chapter: 'deepagents',
		short: 'Harness tool: search file contents by regex.',
		long: 'grep("pattern", path?) — content search across virtual files; complements ls/glob for exploration.'
	},
	{
		term: 'assembleSystemPrompt',
		chapter: 'deepagents',
		short: 'Concatenate BASE + middleware + user prompt layers.',
		long: 'assembleSystemPrompt({ user, todos, files, skills, subagents }) — harness lesson preview shows composed system string before agent run.'
	},
	{
		term: 'BASE_AGENT_PROMPT',
		chapter: 'deepagents',
		short: 'Default harness system prompt constant.',
		long: 'Shipped base instructions (plan, files, delegate) prepended before middleware and user layers in every createDeepAgent run.'
	},

	// ── Setup & runtime ─────────────────────────────────────────────────────
	{
		term: 'getModel',
		chapter: 'general',
		short: 'LangX factory returning a configured chat model.',
		long: 'await getModel({ temperature, maxTokens }) from $lib/runtime/llm resolves preferred provider (Anthropic, OpenAI, Groq, Transformers.js) — every lesson demo invokes through this entry point.'
	},
	{
		term: 'makeEmbeddings',
		chapter: 'general',
		short: 'LangX factory for RAG embedding providers.',
		long: 'makeEmbeddings() picks MiniLM locally or OpenAI/Voyage when keys are set — same interface for buildStore regardless of where vectors are computed.'
	},
	{
		term: 'provider',
		chapter: 'general',
		short: 'Configured LLM backend: anthropic, openai, groq, or transformers-js.',
		long: 'Setup Step 2 and resolveProvider() in getModel() pick the runtime; app.preferredProvider and per-provider API keys in localStorage gate all lesson demos.'
	},
	{
		term: 'API key',
		chapter: 'general',
		short: 'Secret credential for a hosted model or embeddings API.',
		long: 'Setup stores anthropic/openai/groq/voyage keys in localStorage (browser-only); NoConfiguredProviderError directs learners to /setup when a hosted path is selected without a key.'
	},
	{
		term: 'localStorage',
		chapter: 'general',
		short: 'Browser key-value store for LangX settings and keys.',
		long: 'API keys and provider preference persist in localStorage on this device only — never sent to a LangX backend. Setup writes keys; app.svelte.ts hydrates state on load.'
	},
	{
		term: 'NoConfiguredProviderError',
		chapter: 'general',
		short: 'Error when a demo runs without a usable model provider.',
		long: 'Thrown by getModel() when preferred provider lacks API key or Transformers.js model — UI links to /setup so learners configure credentials before invoking live demos.'
	},
	{
		term: 'WebGPU',
		chapter: 'general',
		short: 'Browser GPU API for fast local inference and embeddings.',
		long: 'detectWebGpu() on layout load; Transformers.js and MiniLM prefer WebGPU with WASM fallback (~5× slower) per setup status copy.'
	},
	{
		term: 'WebAssembly',
		chapter: 'general',
		short: 'WASM fallback when WebGPU is unavailable.',
		long: 'Transformers.js runs on WASM when WebGPU is missing or flaky — setup warns local models are slower without GPU acceleration.'
	},
	{
		term: 'Transformers.js',
		chapter: 'general',
		short: 'Run Hugging Face models in-browser via WebGPU/WASM.',
		long: 'TransformersJsChatModel loads cached models from TJS_MODELS — no API key at runtime after download; setup warns harness needs good+ Agentic grade.'
	},
	{
		term: 'Voyage',
		chapter: 'general',
		short: 'Optional cloud embeddings provider (voyage-3.5, 1024-dim).',
		long: 'Setup Voyage key field and makeEmbeddings voyage path use VoyageEmbeddings when key is set — alternative to local MiniLM or OpenAI text-embedding-3-small in RAG.'
	},
	{
		term: 'Agentic grade',
		chapter: 'general',
		short: 'Setup label for local model tool-loop reliability.',
		long: 'TJS_MODELS.agenticGrade ranks browser models weak→excellent for Deep Agents fitness — setup copy says harness behavior needs at least good tool-calling for Phase 3.'
	},
	{
		term: 'TTFT',
		chapter: 'general',
		short: 'Time to first token — model latency on setup cards.',
		long: 'Each Transformers.js model lists bench.ttftMs beside throughput tok/s — helps pick local models for interactive streaming lessons.'
	},
	{
		term: 'LangSmith',
		chapter: 'general',
		short: 'LangChain observability, evals, and deployment platform.',
		long: 'withConfig runName/tags appear in LangSmith traces; Beyond lesson links docs.smith.langchain.com and Managed Deep Agents /v1/deepagents for hosted harness runs.'
	},
	{
		term: 'IndexedDB',
		chapter: 'general',
		short: 'Browser durable storage backing StoreBackend.',
		long: 'LangX wraps IndexedDB with Dexie for /memories/ files that survive tab reloads — Backends lesson proves persistence after refresh.'
	},
	{
		term: 'dangerouslyAllowBrowser',
		chapter: 'general',
		short: 'Opt-in flag for calling provider APIs from the browser.',
		long: 'ChatOpenAI and ChatAnthropic require dangerouslyAllowBrowser: true in LangX because demos invoke models client-side rather than through a server proxy.'
	},
	{
		term: 'maxTokens',
		chapter: 'general',
		short: 'Cap on tokens the model may generate per call.',
		long: 'Passed to getModel({ maxTokens }) and chat model constructors — limits completion length and cost. Distinct from compaction maxTokens budget on message history.'
	},
	{
		term: 'Web Worker',
		chapter: 'general',
		short: 'Browser thread with no DOM, cookies, or network from parent.',
		long: 'Beyond and data-science lessons use Workers as the in-tab sandbox substrate — same postMessage shape as remote sandboxes, tighter isolation than full VMs.'
	},

	// ── LangChain · RAG, LCEL, streaming, models ────────────────────────────
	{
		term: 'oracle',
		chapter: 'langchain',
		short: 'Passive Q&A model that never executes tools or side effects.',
		long: 'Tools lesson contrasts early LLMs as oracles (question in, paragraph out) with tool-calling agents that act in your system. Every ReAct loop in LangX is the shift from oracle to participant.'
	},
	{
		term: 'participant',
		chapter: 'langchain',
		short: 'Model that calls typed tools and shares a runtime loop with your code.',
		long: 'Once bindTools is wired, the model chooses tools turn-by-turn and your runtime executes them — the model becomes a participant in the system, not a detached text generator.'
	},
	{
		term: 'grounding',
		chapter: 'langchain',
		short: 'Constraining generation to retrieved or supplied context only.',
		long: 'RAG demo system prompt requires answering ONLY from numbered passages and admitting when context is insufficient — grounding is enforced at the prompt seam, not by hoping the model remembers.'
	},
	{
		term: 'citation',
		chapter: 'langchain',
		short: 'Inline reference to a retrieved passage (e.g. [1], [2]).',
		long: 'answerWithRag packs hits as [n] (source) text and instructs the model to cite passages it uses; skills and research capstones extend the same discipline for subagent briefs.'
	},
	{
		term: 'BM25',
		chapter: 'langchain',
		short: 'Classic sparse lexical retriever (keyword/BM25 scoring).',
		long: 'RAG caveats slide names hybrid search as BM25 plus dense vectors — LangX in-browser path is dense-only, but production stacks often blend BM25 rank with embedding search.'
	},
	{
		term: 'hybrid search',
		chapter: 'langchain',
		short: 'Retrieval combining sparse (BM25) and dense (embedding) signals.',
		long: 'Taught as an operational upgrade over pure vector search when keyword overlap matters; LangX demos cosine similarity only, but the lesson explicitly flags hybrid search for real corpora.'
	},
	{
		term: 'embedding model',
		chapter: 'langchain',
		short: 'Model that maps text to fixed-length vectors for similarity search.',
		long: 'RAG indexes with Xenova/all-MiniLM-L6-v2 locally or OpenAI/Voyage APIs via makeEmbeddings; query and documents embed at different times, then rank by distance at search time.'
	},
	{
		term: 'MiniLM',
		chapter: 'langchain',
		short: 'Small sentence embedding model (384-dim) bundled for browser RAG.',
		long: 'LangX uses Xenova/all-MiniLM-L6-v2 (~25 MB, WebGPU/WASM) in MiniLmEmbeddings for offline chunk indexing — the RAG lesson default local embeddings provider.'
	},
	{
		term: 'OpenAIEmbeddings',
		chapter: 'langchain',
		short: 'Cloud embedding wrapper (text-embedding-3-small, 1536-dim).',
		long: 'RAG provider option when OPENAI_API_KEY is set via makeEmbeddings — alternative to bundled MiniLM or Voyage for higher-quality cloud vectors.'
	},
	{
		term: 'RecursiveCharacterTextSplitter',
		chapter: 'langchain',
		short: 'Text splitter preferring paragraph → sentence → word boundaries.',
		long: 'chunkDocuments uses RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap }) from @langchain/textsplitters — where most RAG quality is won or lost before any LLM call.'
	},
	{
		term: 'Document',
		chapter: 'langchain',
		short: 'LangChain document object: pageContent plus metadata.',
		long: 'buildStore wraps each chunk as new Document({ pageContent, metadata: { source, index } }) before addDocuments on the vector store — metadata drives citation labels in the UI.'
	},
	{
		term: 'pageContent',
		chapter: 'langchain',
		short: 'Main text body stored on a LangChain Document.',
		long: 'Chunk text lives in pageContent; metadata carries source labels. Retriever returns Document objects whose pageContent is injected into the grounded generation prompt.'
	},
	{
		term: 'chunkOverlap',
		chapter: 'langchain',
		short: 'Characters repeated between adjacent chunks to preserve boundary context.',
		long: 'Default chunkOverlap 40 in rag-pipeline.ts pairs with chunkSize 280 so facts split across chunk borders still appear intact in at least one indexed slice.'
	},
	{
		term: 'chunkSize',
		chapter: 'langchain',
		short: 'Target maximum characters per RAG chunk before embedding.',
		long: 'RecursiveCharacterTextSplitter chunkSize (default 280 in LangX) trades retrieval precision vs context — tune with chunkOverlap for your corpus.'
	},
	{
		term: 'similaritySearch',
		chapter: 'langchain',
		short: 'Vector-store API: embed query, return top-k scored documents.',
		long: 'InMemoryVectorStore.similaritySearch(question, k) returns { doc, score } rows with raw cosine in [-1, 1] — retrieval half of answerWithRag before grounded generation.'
	},
	{
		term: 'InMemoryVectorStore',
		chapter: 'langchain',
		short: 'Browser-local vector index over embedded Documents.',
		long: 'LangX teaching stand-in for pgvector/Pinecone/Chroma: embed chunks at index time, similaritySearch at query time, with scores surfaced in the RAG lesson UI.'
	},
	{
		term: 'Pinecone',
		chapter: 'langchain',
		short: 'Managed vector database for production RAG.',
		long: 'RAG lesson names Pinecone alongside pgvector and Chroma as production indexes — same embed → search → generate pipeline, different persistence layer.'
	},
	{
		term: 'pgvector',
		chapter: 'langchain',
		short: 'Postgres extension for vector similarity search.',
		long: 'Production alternative to in-memory RAG index cited in the RAG lesson; stores embeddings in Postgres for durable, scalable retrieval at query time.'
	},
	{
		term: 'Chroma',
		chapter: 'langchain',
		short: 'Open-source embedding database for RAG.',
		long: 'Named in RAG lesson as a production vector store option; LangX demos use a plain in-memory search but the retrieval half of RAG is identical.'
	},
	{
		term: 'RunnableSequence',
		chapter: 'langchain',
		short: 'Runnable built by chaining .pipe() steps left-to-right.',
		long: 'prompt.pipe(model).pipe(parser) compiles to a RunnableSequence — lazy until invoke/stream/batch; LCEL diagrams label PromptTemplate → Model → OutputParser as this shape.'
	},
	{
		term: 'RunnableLambda',
		chapter: 'langchain',
		short: 'Runnable wrapping an arbitrary function in the LCEL graph.',
		long: 'runnables-fanout.ts uses new RunnableLambda({ func }) inside RunnablePassthrough.assign to echo input — any sync transform can become a Runnable node.'
	},
	{
		term: 'RunnablePassthrough.assign',
		chapter: 'langchain',
		short: 'Passthrough branch that adds fields to parallel output.',
		long: 'RunnableParallel fan-out demo uses RunnablePassthrough.assign({}) to keep original input keys while sibling chains produce short and bullets branches concurrently.'
	},
	{
		term: 'ChatPromptValue',
		chapter: 'langchain',
		short: 'Intermediate value after a prompt template invoke (messages for the model).',
		long: 'Runnables lesson traces { topic } → ChatPromptValue → AIMessage → string; invoke on ChatPromptTemplate fills placeholders into role-tagged messages the chat model consumes.'
	},
	{
		term: 'OutputParser',
		chapter: 'langchain',
		short: 'Runnable that converts model output to a typed final value.',
		long: 'Diagrams use the generic OutputParser node; StringOutputParser is the concrete parser stripping AIMessage.content to string at the end of LCEL chains.'
	},
	{
		term: 'on_chat_model_stream',
		chapter: 'langchain',
		short: 'streamEvents v2 event: one token chunk from the chat model.',
		long: 'streaming.ts filters ev.event === "on_chat_model_stream" and previews ev.data.chunk.content — finest-grained signal for live token UIs and debug panels.'
	},
	{
		term: 'on_chat_model_start',
		chapter: 'langchain',
		short: 'streamEvents v2 event: chat model began a generation.',
		long: 'Emitted at the Runnable boundary before tokens; paired with on_chat_model_end in the Streaming lesson switch for lifecycle tracing across the chain.'
	},
	{
		term: 'on_chat_model_end',
		chapter: 'langchain',
		short: 'streamEvents v2 event: chat model finished a generation.',
		long: 'Marks completion of the model step in streamEvents({ version: "v2" }) — use with on_chat_model_stream to bracket token streams in audit logs.'
	},
	{
		term: 'on_chain_start',
		chapter: 'langchain',
		short: 'streamEvents v2 event: a Runnable chain step started.',
		long: 'Fires at nested chain boundaries in streamEvents; Demo 2 records chain/model/parser lifecycle alongside token events for observability.'
	},
	{
		term: 'on_chain_end',
		chapter: 'langchain',
		short: 'streamEvents v2 event: a Runnable chain step completed.',
		long: 'Closes a chain span in the v2 event stream — complements on_chain_start when building hierarchical traces in the Streaming lesson.'
	},
	{
		term: 'on_parser_end',
		chapter: 'langchain',
		short: 'streamEvents v2 event: parser produced its final parsed value.',
		long: 'Captured in runEventStream when the StringOutputParser finishes — signals the chain last shape change before the aggregated string result.'
	},
	{
		term: 'callbacks',
		chapter: 'langchain',
		short: 'Hooks observing Runnable runs (tracing, logging, metrics).',
		long: 'Runnables narrative notes LCEL chains inherit batching, streaming, retries, fallbacks, and observable callbacks for free — withConfig runName/tags label runs in streamEvents and LangSmith.'
	},
	{
		term: 'fallbacks',
		chapter: 'langchain',
		short: 'Alternate Runnable path when a step fails.',
		long: 'Mentioned alongside retries in LCEL corpus text and Runnable composition — production chains often .withFallbacks() beside withRetry on fragile model calls.'
	},
	{
		term: 'runName',
		chapter: 'langchain',
		short: 'Human-readable label for a Runnable in traces.',
		long: 'streaming.ts uses .withConfig({ runName: "prompt" | "model" | "parser" }) so streamEvents and LangSmith show stable step names instead of anonymous runnables.'
	},
	{
		term: 'tool_calls',
		chapter: 'langchain',
		short: 'Structured tool invocations on an AIMessage.',
		long: 'After bindTools, AIMessage.tool_calls lists { name, args, id }; agent and ToolNode loops execute each call and append ToolMessages before re-invoking the model.'
	},
	{
		term: 'tool_call_id',
		chapter: 'langchain',
		short: 'ID linking a ToolMessage back to a specific tool_calls entry.',
		long: 'new ToolMessage({ content, tool_call_id: tc.id }) pairs results with the model request; compaction evicts by tool_call_id under /large_tool_results/.'
	},
	{
		term: 'ChatAnthropic',
		chapter: 'langchain',
		short: 'LangChain wrapper for Anthropic Claude models.',
		long: 'Recommended LangX hosted provider — claude-haiku-4-5 with dangerouslyAllowBrowser. Used in tools and runnables examples; strong tool use in browser demos.'
	},
	{
		term: 'ChatOpenAI',
		chapter: 'langchain',
		short: 'LangChain wrapper for OpenAI chat models.',
		long: 'createReactAgent and getModel openai path use gpt-4o-mini via browser configuration; also backs OpenAIEmbeddings when RAG provider is openai.'
	},
	{
		term: 'ChatGroq',
		chapter: 'langchain',
		short: 'LangChain wrapper for Groq-hosted Llama models.',
		long: 'getModel groq path returns ChatGroq with llama-3.3-70b-versatile — high throughput option on /setup for hosted inference without local download.'
	},
	{
		term: 'synthesis',
		chapter: 'langchain',
		short: 'Map-reduce collect phase merging parallel branch outputs.',
		long: 'After Send fan-out, a synthesize node reads merged answers[] and produces one consolidated response — the reduce half of map-reduce in conditional-edges lesson.'
	},

	// ── LangGraph · streaming, interrupts, state ─────────────────────────────
	{
		term: 'MessagesPlaceholder',
		chapter: 'langgraph',
		short: 'Prompt slot injecting a messages[] field from graph state.',
		long: 'buildChatGraph uses new MessagesPlaceholder("messages") so ChatPromptTemplate receives the full thread history from MessagesAnnotation on each checkpointer-backed invoke.'
	},
	{
		term: 'langgraph_node',
		chapter: 'langgraph',
		short: 'Metadata tag naming which graph node emitted a stream chunk.',
		long: 'streamMode: "messages" yields [chunk, { langgraph_node }]; lg-streaming-modes maps it to label tokens from agent vs tools for selective UI highlighting.'
	},
	{
		term: 'ChatGenerationChunk',
		chapter: 'langgraph',
		short: 'Token chunk type in streamMode: messages tuples.',
		long: 'Streaming-modes lesson documents messages mode as [ChatGenerationChunk, metadata] per LLM token — graph-level streaming counterpart to chain.stream() string chunks.'
	},
	{
		term: '__interrupt__',
		chapter: 'langgraph',
		short: 'Invoke result field listing pending human interrupts.',
		long: 'After interrupt(), graph.invoke returns __interrupt__ with payload values; host reads interrupts[0].value, then resumes with Command({ resume }) on the same thread_id.'
	},
	{
		term: 'approve_draft',
		chapter: 'langgraph',
		short: 'Interrupt payload type for draft review in the email demo.',
		long: 'lg-interrupts calls interrupt({ type: "approve_draft", draft }) so the HITL UI shows the proposed email; resume passes { decision: "approve" | "edit" | "reject", text? }.'
	},
	{
		term: 'resume',
		chapter: 'langgraph',
		short: 'Continue a paused graph or harness with human input.',
		long: 'Command({ resume: value }) on graph.invoke continues after interrupt(); CompiledDeepAgent.resume(decision, thread) wraps the same pattern for harness HITL loops.'
	},
	{
		term: 'checkpoint values',
		chapter: 'langgraph',
		short: 'snap.values — full state snapshot at a checkpoint.',
		long: 'getStateHistory yields snap.values (e.g. { count, log }) after each superstep; time-travel UI lists these alongside checkpoint_id for fork and replay.'
	},
	{
		term: 'checkpoint next',
		chapter: 'langgraph',
		short: 'snap.next — pending node(s) after a checkpoint.',
		long: 'History entries expose snap.next (e.g. ["approve"] after interrupt); explains where the runtime will resume before Command({ resume }) is applied.'
	},
	{
		term: 'recursionLimit',
		chapter: 'langgraph',
		short: 'Max graph steps per invoke (safety cap).',
		long: 'createDeepAgent passes recursionLimit: opts.maxIterations ?? 50 in configurable invoke config — prevents infinite agent↔tools loops in harness and capstone demos.'
	},
	{
		term: 'fan-in',
		chapter: 'langgraph',
		short: 'Merge parallel branch outputs via reducers before the next node.',
		long: 'Send fan-out diagram labels reduce as fan-in: research branches write to answers with a concat reducer, then synthesize reads the merged list — map-reduce collect phase.'
	},
	{
		term: 'Annotation.Root',
		chapter: 'langgraph',
		short: 'Factory for a typed state schema object on StateGraph.',
		long: 'Annotation.Root({ field: Annotation<T>({ reducer, default }) }) declares channels — used in FanoutState, CounterState, DeepAgentState, and every lesson graph builder.'
	},
	{
		term: 'PostgresSaver',
		chapter: 'langgraph',
		short: 'Production checkpointer persisting to PostgreSQL.',
		long: 'Beyond lesson names Postgres checkpoints for durable graph state across processes; MemorySaver in LangX demos — same compile({ checkpointer }) API, different storage.'
	},

	// ── Deep Agents · state, compaction, production ─────────────────────────
	{
		term: 'DeepAgentState',
		chapter: 'deepagents',
		short: 'StateGraph schema: messages + todos + files + reports + summ events.',
		long: 'Extends MessagesAnnotation with reducers for files (merge by path), append-only subagentReports and summarizationEvents, and replace reducer on todos — createDeepAgent compiles agent/tools on this state.'
	},
	{
		term: 'VirtualFile',
		chapter: 'deepagents',
		short: 'Harness file record: path, content, optional backend tag.',
		long: 'DeepAgentState.files and BackendProtocol list() use VirtualFile; FileTreeViewer and capstone UIs render the agent workspace independent of real disk.'
	},
	{
		term: 'Todo',
		chapter: 'deepagents',
		short: 'Plan step: content plus pending | in_progress | completed.',
		long: 'write_todos replaces DeepAgentState.todos; harness middleware injects ## Active plan into the system prompt and todos lesson audits every status transition.'
	},
	{
		term: 'SubAgentReport',
		chapter: 'deepagents',
		short: 'Completed subagent result: name, summary, durationMs.',
		long: 'task tool appends SubAgentReport via reducer; parent sees reports[] and subagent timeline without the child message history — research capstone surfaces these cards.'
	},
	{
		term: 'SubAgentSpec',
		chapter: 'deepagents',
		short: 'Config object defining a delegatable subagent.',
		long: '{ name, description, prompt, run({ description }) } registered in createDeepAgent({ subagents }); createTaskTool exposes task({ subagent, description }) enum over configured names.'
	},
	{
		term: 'SummarizationEvent',
		chapter: 'deepagents',
		short: 'Audit record after context summarization (path, counts, summary).',
		long: 'summarizeOlder pushes { at, evictedMessages, summary, historyPath } into summarizationEvents; compaction lesson trace shows when middle history was collapsed to /conversation_history/.'
	},
	{
		term: 'CompactionConfig',
		chapter: 'deepagents',
		short: 'Thresholds and limits for the four-tier compaction pipeline.',
		long: 'createDeepAgent({ compaction: { maxTokens, evictThresholdPct, summarizeThresholdPct, largeToolResultMin, historyKeep } }) drives evictLargeToolResults, truncateRepeatedArguments, summarizeOlder, and overflow behavior.'
	},
	{
		term: 'evictThresholdPct',
		chapter: 'deepagents',
		short: 'Percent of maxTokens triggering tier-1 eviction and arg truncation.',
		long: 'compact() runs evictLargeToolResults and truncateRepeatedArguments when total ≥ maxTokens * evictThresholdPct / 100 — compaction lesson uses 35% for visible demos.'
	},
	{
		term: 'summarizeThresholdPct',
		chapter: 'deepagents',
		short: 'Percent of maxTokens triggering LLM summarization of old turns.',
		long: 'When token total crosses this threshold, summarizeOlder replaces middle messages with one AIMessage summary and archives raw text to /conversation_history/.'
	},
	{
		term: 'largeToolResultMin',
		chapter: 'deepagents',
		short: 'Minimum ToolMessage length (chars) to evict to virtual FS.',
		long: 'evictLargeToolResults replaces oversized tool output with path + preview when content.length ≥ largeToolResultMin — keeps context small while preserving read_file access.'
	},
	{
		term: 'historyKeep',
		chapter: 'deepagents',
		short: 'Tail message count preserved across summarization.',
		long: 'summarizeOlder keeps the last historyKeep exchanges (pair-safe boundary) so recent tool_calls/ToolMessage groups are never split — compaction demo sets 4.'
	},
	{
		term: 'conversation_history',
		chapter: 'deepagents',
		short: 'Virtual path prefix for archived pre-summary transcripts.',
		long: 'summarizeOlder writes /conversation_history/segment-<ts>.md with the evicted middle block; needle-in-a-haystack evals verify facts remain reachable via read_file after compaction.'
	},
	{
		term: 'large_tool_results',
		chapter: 'deepagents',
		short: 'Virtual path prefix for evicted oversized tool outputs.',
		long: 'Tier-1 eviction writes /large_tool_results/<tool_call_id>-<ts>.txt and replaces inline ToolMessage content with a short preview plus read_file path.'
	},
	{
		term: 'evictLargeToolResults',
		chapter: 'deepagents',
		short: 'Compaction tier-1: move oversized ToolMessages to virtual FS.',
		long: 'When evictThresholdPct is crossed, tool results ≥ largeToolResultMin chars are written under /large_tool_results/ and replaced with preview + path in the active context.'
	},
	{
		term: 'truncateRepeatedArguments',
		chapter: 'deepagents',
		short: 'Compaction tier-2: dedupe repeated tool argument blobs.',
		long: 'Runs at tier-1 threshold alongside eviction — collapses identical argument strings repeated across tool_calls to save tokens without losing call structure.'
	},
	{
		term: 'summarizeOlder',
		chapter: 'deepagents',
		short: 'Compaction tier-3: LLM summary of middle message history.',
		long: 'At summarizeThresholdPct, replaces evictable middle turns with one AIMessage summary and archives raw transcript to /conversation_history/ — preserves historyKeep tail intact.'
	},
	{
		term: 'first-match-wins',
		chapter: 'deepagents',
		short: 'Permission rule: earliest matching glob+operation decides allow/deny.',
		long: 'evaluate() in permissions.ts stops at the first rule whose operations and paths match — permissions lesson orders deny-before-allow rules so .env and secrets/** block writes.'
	},
	{
		term: 'CompositeRoute',
		chapter: 'deepagents',
		short: 'Prefix + backend pair in CompositeBackend routing table.',
		long: 'new CompositeBackend([{ prefix: "/memories/", backend: new StoreBackend("scope") }], new StateBackend()) — first matching prefix wins, else fallback backend.'
	},
	{
		term: 'CompiledDeepAgent',
		chapter: 'deepagents',
		short: 'Return type of createDeepAgent: invoke, start, resume, subscribe.',
		long: 'Exposes invoke({ input, thread }), start for HITL pause detection, resume(value, thread) with Command, live state getter, and subscribe for UI snapshots — capstone DS keeps handles for follow-ups.'
	},
	{
		term: 'start',
		chapter: 'deepagents',
		short: 'Run harness until done or first HITL interrupt.',
		long: 'await agent.start({ input, thread }) returns { status: "interrupted", interrupt } or { status: "done", state } — HITL lesson host loop polls this instead of raw graph.invoke.'
	},
	{
		term: 'subscribe',
		chapter: 'deepagents',
		short: 'Listen for live harness state snapshots during a run.',
		long: 'CompiledDeepAgent.subscribe(callback) pushes state updates to UI components (FileTreeViewer, TodoListView, ContextMeter) without polling graph.getState manually.'
	},
	{
		term: 'HarnessInterrupt',
		chapter: 'deepagents',
		short: 'Pending HITL payload: tool name, args, optional id.',
		long: 'start() returns { status: "interrupted", interrupt: { tool, args, id } } read from __interrupt__; da-hitl loops approve/reject/edit before tool execution proceeds.'
	},
	{
		term: 'maxIterations',
		chapter: 'deepagents',
		short: 'createDeepAgent option capping agent↔tools loop iterations.',
		long: 'Mapped to graph recursionLimit in invoke config (default 50); todos, compaction, and capstone demos set lower values for predictable classroom runs.'
	},
	{
		term: 'memorySummary',
		chapter: 'deepagents',
		short: 'Optional persistent memory block in assembled system prompt.',
		long: 'assembleSystemPrompt adds ## Persistent memory when createDeepAgent({ memorySummary }) is set — cross-thread facts without stuffing full history into every turn.'
	},
	{
		term: 'instructions',
		chapter: 'deepagents',
		short: 'User/task layer appended in harness system prompt (# USER).',
		long: 'createDeepAgent({ instructions }) becomes the USER section after BASE and middleware layers — harness and capstone demos pass multi-step recipes through this string.'
	},
	{
		term: 'SKILL.md',
		chapter: 'deepagents',
		short: 'Markdown skill file loaded on demand by load_skill.',
		long: 'skills/ directory holds SKILL.md per skill — catalog shows description only; load_skill(name) injects full body into context per progressive disclosure pattern.'
	},
	{
		term: 'fetch_chunk',
		chapter: 'deepagents',
		short: 'Compaction-demo tool returning synthetic large text blocks.',
		long: 'da-compaction registers fetch_chunk({ label }) to force tier-1 eviction to /large_tool_results/ before the agent read_file("/needle.md") needle check.'
	},
	{
		term: 'delete_file',
		chapter: 'deepagents',
		short: 'Harness tool: remove a path from the virtual filesystem.',
		long: 'delete_file(path) routes through BackendProtocol.delete — permissions lesson may deny deletes on protected prefixes like production FilesystemBackend agents.'
	},
	{
		term: 'compute',
		chapter: 'deepagents',
		short: 'Capstone tool: run JS in scoped Worker with csv pre-bound.',
		long: 'compute({ code }) calls JsSandbox.run(code, { csv }) — no DOM/network; returns JSON-serializable aggregates for the data-science capstone report pipeline.'
	},
	{
		term: 'plot',
		chapter: 'deepagents',
		short: 'Capstone tool: Observable Plot chart → SVG in virtual FS.',
		long: 'plot({ mark, data, x, y, title }) renders bar/line/dot via @observablehq/plot and write_file to /reports/figures/n.svg referenced from the markdown report.'
	},
	{
		term: 'Observable Plot',
		chapter: 'deepagents',
		short: 'Charting library used to emit SVG figures in-browser.',
		long: 'da-capstone-data-science imports @observablehq/plot (Plot.barY, Plot.line, Plot.plot) — stand-in for production chart backends while keeping the agent loop identical.'
	},
	{
		term: 'JsSandbox',
		chapter: 'deepagents',
		short: 'Web Worker wrapper for scoped JS execution (compute tool).',
		long: 'JsSandbox.postMessage runs user/agent code with csv injected — capstone-data-science lesson contrasts it with Modal/Daytona remote sandboxes in production.'
	},
	{
		term: 'QuickJS',
		chapter: 'deepagents',
		short: 'Embedded JS engine for production code execution.',
		long: 'Beyond lesson and data-science capstone cite QuickJS as the production Deep Agents interpreter; LangX substitutes JsSandbox Web Worker with the same compute-tool shape.'
	},
	{
		term: 'Tracer',
		chapter: 'deepagents',
		short: 'Harness event bus for run/node/tool/subagent/fs telemetry.',
		long: 'createTracer().emit(...) records run_start, node_start, fs_op, eviction, subagent_spawn, interrupt, etc.; TraceLog and capstone panels subscribe for live timelines.'
	},
	{
		term: 'TraceEvent',
		chapter: 'deepagents',
		short: 'One traced harness event: kind, label, timestamp, optional data.',
		long: 'TraceEventKind covers the full deep-agent lifecycle; demos push growing arrays to onTrace callbacks so learners see compaction and delegation as structured logs.'
	},
	{
		term: 'context quarantine',
		chapter: 'deepagents',
		short: 'Isolating subagent work from the parent transcript.',
		long: 'Subagents lesson narrative: child runs full internal debate; parent receives only task() summary — prevents token inflation and keeps parent context focused on orchestration.'
	},
	{
		term: 'AGENTS.md',
		chapter: 'deepagents',
		short: 'Managed Deep Agent root instruction file (production layout).',
		long: 'Beyond lesson lists AGENTS.md beside skills/, subagents/, tools.json in the LangSmith /v1/deepagents file tree — same harness policy LangX configures in code.'
	},
	{
		term: 'tools.json',
		chapter: 'deepagents',
		short: 'Managed Deep Agent manifest of extra tool definitions.',
		long: 'Referenced with AGENTS.md in the managed deployment slide — declares tools beyond harness builtins while MCP servers supply runtime implementations.'
	},
	{
		term: 'LocalShellBackend',
		chapter: 'deepagents',
		short: 'Production backend exposing a real shell behind permissions.',
		long: 'Beyond lesson names LocalShellBackend as the upgrade from virtual FS — same BackendProtocol surface, different implementation, gated by filesystem permission rules.'
	},
	{
		term: 'FilesystemBackend',
		chapter: 'deepagents',
		short: 'Production backend mapping virtual paths to a real disk root.',
		long: 'Contrasted with Dexie StoreBackend in LangX — roots read_file/write_file on actual files for coding agents while tool names stay unchanged.'
	},
	{
		term: 'Managed Deep Agents',
		chapter: 'deepagents',
		short: 'LangSmith-hosted harness service (/v1/deepagents).',
		long: 'Beyond lesson: ship file-tree config, attach MCP, run threads with interrupts and HTTP streaming — identical harness shape to createDeepAgent in this repo.'
	},
	{
		term: 'Modal',
		chapter: 'deepagents',
		short: 'Cloud sandbox platform for agent code execution.',
		long: 'Beyond lesson production substrate for full-language stacks (Python, Node); replaces LangX Web Worker when agents need real containers and network-isolated compute.'
	},
	{
		term: 'Daytona',
		chapter: 'deepagents',
		short: 'Dev-container sandbox platform for agents.',
		long: 'Named with Runloop in Beyond lesson as remote VM alternative — persistent volumes and shell access for long-horizon coding agents outside the browser.'
	},
	{
		term: 'Runloop',
		chapter: 'deepagents',
		short: 'Managed dev-container sandbox for agent workloads.',
		long: 'Beyond lesson production option alongside Daytona; LangX deliberately uses in-browser stand-ins so lessons stay reproducible in a static tab.'
	},
	{
		term: 'Tavily',
		chapter: 'deepagents',
		short: 'Search API commonly exposed via MCP to agents.',
		long: 'Beyond lesson tool-ecosystem example — real agents attach Tavily through MCP servers; LangX uses deterministic stand-ins behind the same tool() wrapper.'
	},
	{
		term: 'Browserbase',
		chapter: 'deepagents',
		short: 'Hosted browser automation for web-agent tools.',
		long: 'Beyond lesson MCP integration example for agents that need real web browsing; contrast with LangX reproducible mock tools in lesson demos.'
	}
];

export function findGlossaryEntry(term: string): GlossaryEntry | undefined {
	const normalized = term.trim().toLowerCase();
	const canonical = aliases[normalized] ?? term.trim();
	const key = canonical.toLowerCase();
	return glossary.find((g) => g.term.toLowerCase() === key);
}
