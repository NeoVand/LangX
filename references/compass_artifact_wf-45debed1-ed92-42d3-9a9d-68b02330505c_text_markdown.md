# The Three Phases of LLM Application Development: LangChain, LangGraph, and the Deep Agents Harness

## TL;DR

- **LangChain Inc. now ships a three-layer stack: a *framework* (`langchain` + LCEL/Runnables), a *runtime* (`langgraph`), and an opinionated *harness* (`deepagents`) that bakes in the planning, sub-agent, virtual-filesystem, and context-management patterns popularized by Claude Code, Deep Research, and Manus. Each layer emerged because the previous one bottomed out at a class of failure mode.**
- **Deep Agents is not a new architecture — it is `create_react_agent` plus a chosen pile of middleware (Todo planning, virtual filesystem, sub-agents, summarization, prompt caching, dangling-tool-call patching, optional memory and HITL) and a long Claude-Code-inspired base prompt. `create_deep_agent` produces a `CompiledStateGraph` defaulting to Anthropic `claude-sonnet-4-6`, gives the model six file tools, a `write_todos` planner, and a `task` sub-agent spawner, and inherits LangGraph's checkpointers, interrupts, streaming, and LangSmith tracing.**
- **Production deep agents are token-hungry and benefit from prompt caching, summarization, async sub-agents (v0.5), pluggable filesystem backends (state / store / filesystem / sandbox), and `deepagents deploy` onto LangSmith Deployments. Use Deep Agents for long-horizon, batteries-included; drop to `langchain.create_agent` for a lean harness; drop to LangGraph when the agent loop itself is the wrong shape.**

## Key Findings

1. **A clean ontology has emerged.** Harrison Chase, on Sequoia *Training Data* Episode 77 *"Context Engineering Our Way to Long-Horizon Agents: LangChain's Harrison Chase"*: *"LangGraph is the runtime. LangChain is the abstraction. Deep Agents are the harness — batteries included: planning, memory, subagents, file systems, and starter prompts."* The deepagents README echoes: *"LangGraph is the graph runtime. LangChain's `create_agent` is a minimal agent harness on top of it. Deep Agents is a more opinionated harness on top of `create_agent`."*
2. **The four-pillar recipe is explicit.** Chase's July 30, 2025 *Deep Agents* post (blog.langchain.com/deep-agents/, "In the Loop" series) names them verbatim: *"Applications like 'Deep Research', 'Manus', and 'Claude Code' have gotten around this limitation by implementing a combination of four things: a planning tool, sub agents, access to a file system, and a detailed prompt."* Every middleware in `deepagents` implements one of those four pillars plus production glue.
3. **`deepagents` is now a middleware composer.** As of 0.5–0.6 the package is a thin assembler that wires `TodoListMiddleware`, `FilesystemMiddleware`, `SubAgentMiddleware`, `SummarizationMiddleware`, `PatchToolCallsMiddleware`, `AnthropicPromptCachingMiddleware`, and optional `MemoryMiddleware`, `SkillsMiddleware`, `HumanInTheLoopMiddleware`, and `AsyncSubAgentMiddleware` over `create_agent`.
4. **The virtual filesystem is a context-engineering trick.** Files live in graph state (`files` channel, a `DeltaChannel` snapshotting every ~50 Pregel steps) by default. Backends (`StateBackend`, `StoreBackend`, `FilesystemBackend`, `LocalShellBackend`, `ContextHubBackend`, `CompositeBackend`, sandbox backends) implement a common `BackendProtocol`. Tool descriptions are lifted from Claude Code — `read_file` defaults to 100 lines with offset/limit pagination, and any tool result over 20,000 tokens is *evicted* to `/large_tool_results/<tool_call_id>`.
5. **Sub-agents are about context quarantine.** The `task` tool description: *"Launch an ephemeral subagent to handle complex, multi-step independent tasks with isolated context windows ... Each agent invocation is stateless ... your prompt should contain a highly detailed task description for the agent to perform autonomously."* `_EXCLUDED_STATE_KEYS = {"messages", "todos", "structured_response", "skills_metadata", "memory_contents"}` literally filters parent state from children.
6. **Production maturity moved fast.** The `langchain-ai/deepagents` repository carries 21.3k stars / 3k forks as of May 2026, with the latest PyPI release `deepagents==0.6.3` published May 20, 2026. v0.5 introduced async sub-agents over LangChain's Agent Protocol; v0.5.3+ introduced harness profiles; `deepagents deploy` is a one-command path to LangSmith Deployments.

## Details

### Phase 1 — Chains: LangChain and the Runnable Protocol (Oct 2022 → 2024)

LangChain began in October 2022 as Harrison Chase's side project at Robust Intelligence, weeks before ChatGPT. Its founding insight was empirical: *"applications using LLMs exhibited similar patterns"* (Chase, NVIDIA AI Podcast). Those patterns — prompt-templating, parsing structured output, retrieval, tool calling, multi-step LLM calls — needed a common vocabulary across providers.

By Q3 2023 the center of gravity was the **LangChain Expression Language (LCEL)** and the **Runnable** protocol. Every prompt, model, parser, retriever, and tool is a `Runnable` exposing `invoke`, `batch`, `stream`, `ainvoke`, `abatch`, `astream`, `astream_events`, `astream_log`, `with_config`, `with_retry`, `with_fallbacks`, `configurable_fields`. The `|` operator is `Runnable.__or__`, which builds a `RunnableSequence`; a dict literal is auto-promoted to `RunnableParallel`. Streaming, batching, async, and configuration all come for free, uniformly.

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template("Summarize {topic} in one sentence.")
chain  = prompt | ChatOpenAI(model="gpt-4o") | StrOutputParser()

chain.invoke({"topic": "the Pregel paper"})
chain.batch([{"topic": "A"}, {"topic": "B"}])
for chunk in chain.stream({"topic": "C"}):
    print(chunk, end="", flush=True)
```

By late 2023 the monolith was split: `langchain-core` (Runnables, messages, prompts, output parsers, tool abstraction), `langchain` (chains, agents, retrievers), `langchain-community` (third-party integrations), and per-provider packages. The 0.1.0 release (Jan 2024) hard-deprecated `LLMChain` for LCEL. **Tool calling** was canonicalized via `ChatModel.bind_tools()` and `with_structured_output()`, replacing regex output parsers.

**Where chains bottomed out.** LCEL's data flow is acyclic. The moment an application needed loops (an agent re-calling the LLM until it stops emitting tool calls), branching on intermediate state, durable checkpoints across crashes or approvals, or long-horizon execution that survived a deploy, LCEL was the wrong shape. The original `AgentExecutor` papered over this with an internal `while`-loop and `intermediate_steps`, but it was a black box: you could not pause it, inspect mid-flight state, conditionally branch a node, or run it as a long-running stateful service. That gap motivated LangGraph.

### Phase 2 — Graphs: LangGraph and the Pregel-Inspired Runtime (mid-2024 → Oct 2025)

LangGraph is *"a low-level orchestration framework for building, managing, and deploying long-running, stateful agents."* Its lineage is explicit: *"LangGraph is inspired by Pregel and Apache Beam. The public interface draws inspiration from NetworkX."* Agents are modeled as bulk-synchronous-parallel computations over a typed shared state, with channels (Pregel) and reducers (Beam).

Core abstractions:

- **`StateGraph(schema)`** — nodes are functions `state -> partial_state`; edges (`add_edge`, `add_conditional_edges`) define control flow.
- **State schema** (`TypedDict`/Pydantic/dataclass) with each field optionally annotated with a **reducer**: `Annotated[list[BaseMessage], add_messages]`, `Annotated[list, operator.add]`. The reducer is how concurrent writes merge.
- **Channels** — every state key is a Pregel-style channel; writes from concurrent branches accumulate in a *superstep*. LangGraph 1.4 added `DeltaChannel`, storing only incremental deltas and snapshotting every K steps — the channel deepagents uses for its `files` map.
- **Checkpointers** — `MemorySaver`, `SqliteSaver`, `PostgresSaver`, `AsyncPostgresSaver`. After every node a checkpoint is written keyed by `thread_id`. `get_state_history(config)` returns every prior checkpoint — *time travel* literally.
- **Interrupts** — `interrupt()` (dynamic) and `interrupt_before`/`interrupt_after` (static). With `Command(resume=...)`, they implement human-in-the-loop where a UI can approve, edit, or reject a pending tool call.
- **`Send(node, state)`** — runtime fan-out. A conditional edge returns a list of `Send` objects; LangGraph spawns each as an independent branch in the next superstep, then fans back in via a reducer. Canonical map-reduce primitive.
- **Streaming modes** — `values`, `updates`, `messages`, `custom`, `debug`. `astream_events` (v2/v3) emits typed `StreamPart` records spanning every LLM/tool/retriever event.
- **Subgraphs** — any compiled graph is a `Runnable` and can be added as a node in a parent graph with state-key namespacing.
- **`create_react_agent`** — the prebuilt standard agent loop in graph form: `assistant` node calling a tool-bound chat model, `ToolNode` executing emitted tool calls, conditional edge `tools_condition` looping back or terminating. With the simultaneous October 22, 2025 release of LangChain 1.0 and LangGraph 1.0, the canonical entry point moved to `langchain.agents.create_agent`, which is built on LangGraph but adds the **middleware** system.

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_core.messages import HumanMessage

class S(TypedDict):
    messages: Annotated[list, add_messages]
    score: Annotated[list[float], list.__add__]

def assistant(state: S):  return {"messages": [model.invoke(state["messages"])]}
def critic(state: S):     return {"score": [run_eval(state["messages"])]}

g = StateGraph(S)
g.add_node("assistant", assistant); g.add_node("critic", critic)
g.add_edge(START, "assistant"); g.add_edge("assistant", "critic")
g.add_conditional_edges("critic", lambda s: "assistant" if s["score"][-1] < 0.8 else END)

with PostgresSaver.from_conn_string("postgresql://...") as ckpt:
    graph = g.compile(checkpointer=ckpt, interrupt_before=["assistant"])
    graph.invoke({"messages": [HumanMessage("draft a one-pager")]},
                 config={"configurable": {"thread_id": "session-42"}})
```

**LangGraph Platform / LangGraph Server / LangSmith Deployments** turns a compiled graph into an Agent-Protocol-compliant HTTP service with managed threads, runs, cron, and background tasks. LangGraph Platform went GA on May 16, 2025; per the LangChain changelog, *"as of October 2025, LangGraph Platform has been re-named to 'LangSmith Deployment'"* and folded into the LangSmith product surface.

**Where graphs bottomed out.** LangGraph solved durability, loops, branching, parallelism, and HITL, but it remained a *runtime*, not an agent. To build a Deep Research clone you still had to write a long Claude-Code-style prompt, design a Todo data structure and its tool, decide how to offload tool outputs, design sub-agent specs and a spawning tool, wire summarization, wire prompt caching, patch dangling tool calls when interrupts happen, etc. Multiple teams independently converged on the same recipe. That recipe is the harness.

### Phase 3 — Harnesses: `deepagents` (July 2025 → present)

#### Framework vs harness

Chase on Sequoia *Training Data* Ep. 77: *"A framework would be abstractions around [the model] ... pretty unopinionated about what actually goes in there. Harnesses are more like batteries included. So when we talk about deep agents, we're talking about we actually give it a planning tool by default. So it has a tool that comes built into the harness."* The harness is **the system you build around the model so the model can be successful in its domain**: prompts, tools, skills, context-management policy. The LangChain post *The Runtime Behind Production Deep Agents* (April 20, 2026) decomposes: harness *(what the model sees)* + runtime *(durability, multi-tenancy, observability, sandboxes)*.

#### The four pillars (Chase, July 30, 2025)

*"Applications like 'Deep Research', 'Manus', and 'Claude Code' have gotten around this limitation by implementing a combination of four things: a planning tool, sub agents, access to a file system, and a detailed prompt."*

1. **A detailed system prompt.** *"Claude Code's recreated system prompts are long. They contain detailed instructions on how to use tools. They contain examples (few shot prompts) on how to behave."* (Chase at ODSC AI West 2025: *"Claude Code's system prompt is nearly 2,000 lines long.")*
2. **A planning tool.** *"Claude Code uses a Todo list tool. Funnily enough — this doesn't do anything! It's basically a no-op. It's just context engineering strategy to keep the agent on track."*
3. **Sub-agents.** *"This allows it to split up tasks ... for context management and prompt shortcuts."*
4. **A file system.** *"It also acts as a shared workspace ... Manus is another example of a deep agent that makes significant use of a file system for 'memory'."*

Every pillar maps to a middleware in `deepagents`.

#### Architecture: how `create_deep_agent` is built

The factory in `libs/deepagents/deepagents/graph.py` (current `main`, `deepagents==0.6.3`):

```python
def create_deep_agent(
    model: str | BaseChatModel | None = None,
    tools: Sequence[BaseTool | Callable | dict[str, Any]] | None = None,
    *,
    system_prompt: str | SystemMessage | None = None,
    middleware: Sequence[AgentMiddleware] = (),
    subagents: Sequence[SubAgent | CompiledSubAgent | AsyncSubAgent] | None = None,
    skills: list[str] | None = None,
    memory: list[str] | None = None,
    permissions: list[FilesystemPermission] | None = None,
    backend: BackendProtocol | BackendFactory | None = None,
    interrupt_on: dict[str, bool | InterruptOnConfig] | None = None,
    response_format: ResponseFormat | type | dict | None = None,
    context_schema: type | None = None,
    checkpointer: Checkpointer | None = None,
    store: BaseStore | None = None,
    debug: bool = False,
    name: str | None = None,
    cache: BaseCache | None = None,
) -> CompiledStateGraph: ...
```

(Note: the old `async_create_deep_agent` from ≤ v0.4 has been removed; the unified factory handles async transparently.)

**Middleware stack ordering**, verbatim from the `create_deep_agent` docstring:

```
Base stack:
  - TodoListMiddleware
  - SkillsMiddleware             (if skills is provided)
  - FilesystemMiddleware
  - SubAgentMiddleware           (if any inline subagents)
  - AsyncSubAgentMiddleware      (if async subagents)
  - SummarizationMiddleware
  - PatchToolCallsMiddleware
User middleware inserted here.
Tail stack:
  - HarnessProfile.extra_middleware   (if any)
  - _ToolExclusionMiddleware          (if profile has excluded_tools)
  - AnthropicPromptCachingMiddleware  (no-op for non-Anthropic)
  - MemoryMiddleware                  (if memory paths provided)
  - HumanInTheLoopMiddleware          (if interrupt_on provided)
```

`FilesystemMiddleware` and `SubAgentMiddleware` are flagged `_REQUIRED_MIDDLEWARE` and cannot be removed via `excluded_middleware`; to hide their tools use `excluded_tools` instead. The compiled graph is finalized `.with_config({"recursion_limit": 9_999, "metadata": {"ls_integration": "deepagents", ...}})` — that high recursion limit is deliberate: deep agents take many small Pregel steps per user message.

#### Middleware system primer

A LangChain `AgentMiddleware` exposes hooks wrapping the agent loop:

- `before_agent(state)` — once per session at the start (e.g., `MemoryMiddleware` loads `AGENTS.md` here).
- `wrap_model_call(request, handler)` — wraps every model invocation; prompt mutations, tool filtering, structured-response strategies attach here.
- `wrap_tool_call(request, handler)` — wraps every tool execution; `FilesystemMiddleware` uses it to *evict* large results; `HumanInTheLoopMiddleware` uses it to issue `interrupt()` before sensitive calls.
- `after_model` / `after_agent` — post-processing hooks (the modern replacement for the legacy `post_model_hook` parameter).
- A `state_schema` — optional `TypedDict` extending `AgentState` so middleware adds private state keys (`todos`, `files`, `memory_contents`, `skills_metadata`, `async_tasks`).

#### Pillar 1 — The system prompt

`BASE_AGENT_PROMPT` in `graph.py` is a Claude-Code-style multi-section prompt opening with: *"You are a deep agent, an AI assistant that helps users accomplish tasks using tools. You respond with text and tool calls. The user can see your responses and tool outputs in real time."* Subsections cover core behavior (*"Be concise and direct. Don't over-explain unless asked. NEVER add unnecessary preamble. Don't say 'I'll now do X' — just do it"*), professional objectivity (*"Prioritize accuracy over validating the user's beliefs"*), the doing-tasks workflow (*"Understand first → Act → Verify ... Keep working until the task is fully complete. Don't stop partway"*), clarifying-request etiquette, and progress updates.

Each *middleware* appends its own section: planning from `TodoListMiddleware`, filesystem usage from `FilesystemMiddleware`, the sub-agent guide from `SubAgentMiddleware`, the offloaded-tool-result note from `SummarizationMiddleware`. Final assembly: **USER → (BASE or HarnessProfile.base_system_prompt) → HarnessProfile.system_prompt_suffix**, joined by blank lines. Passing a `SystemMessage` (rather than a string) lets you place explicit Anthropic `cache_control` breakpoints.

#### Pillar 2 — Planning (`TodoListMiddleware`, `write_todos`)

A single tool whose entire job is to **make the model commit a plan to state**. Verbatim from the tool description: *"Use this tool to create and manage a structured task list for your current work session ... Only use this tool if you think it will be helpful in staying organized. If the user's request is trivial and takes less than 3 steps, it is better to NOT use this tool and just do the task directly."*

State schema is `PlanningState` with `todos: list[Todo]`, each todo `{"content": str, "status": Literal["pending", "in_progress", "completed"]}`. The injected system prompt explicitly forbids parallel calls (*"The `write_todos` tool should never be called multiple times in parallel"*) and pushes the model to flip statuses immediately. The tool is a *no-op* computationally; the value is contextual: forcing the model to externalize and update a plan reduces drift on long-horizon tasks.

#### Pillar 3 — Filesystem (`FilesystemMiddleware`)

The central context-engineering surface. Files live by default in `FilesystemState.files: Annotated[dict[str, FileData], DeltaChannel(_file_data_delta_reducer, snapshot_frequency=50)]` — in LangGraph state, persisted by the checkpointer, with `DeltaChannel` storing only deltas. Seven tools exposed (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, and conditionally `execute` if the backend implements `SandboxBackendProtocol`).

Tool descriptions are lifted from Claude Code in spirit and often verbatim. From `filesystem.py`:

- `READ_FILE_TOOL_DESCRIPTION` — *"By default, it reads up to 100 lines starting from the beginning of the file ... Use pagination with offset and limit parameters to avoid context overflow ... Results are returned using `cat -n` format ... Lines longer than 5,000 characters will be split into multiple lines with continuation markers ... You should ALWAYS make sure a file has been read before editing it."* `DEFAULT_READ_OFFSET = 0`, `DEFAULT_READ_LIMIT = 100`.
- `WRITE_FILE_TOOL_DESCRIPTION` — *"Writes to a new file in the filesystem ... Prefer to edit existing files (with the edit_file tool) over creating new ones when possible."*
- `EDIT_FILE_TOOL_DESCRIPTION` — *"Performs exact string replacements in files ... You must read the file before editing. This tool will error if you attempt an edit without reading the file first ... preserve the exact indentation ... ALWAYS prefer editing existing files over creating new ones. Only use emojis if the user explicitly requests it."* Backed by `replace_all: bool = False`; `old_string` must be unique unless `replace_all=True`.

**Automatic large-result eviction** is the single most important production feature. `FilesystemMiddleware.__init__` defaults: `tool_token_limit_before_evict=20000`, `human_message_token_limit_before_evict=50000`. Whenever a tool returns more than 20k tokens (or a user message exceeds 50k), `wrap_tool_call` writes the payload to `/large_tool_results/<tool_call_id>` and replaces the inline content with a head+tail preview plus instructions to read paginated chunks. The filesystem tools themselves are listed in `TOOLS_EXCLUDED_FROM_EVICTION` so they don't recursively evict their own outputs.

**Backends.** The `BackendProtocol` abstracts where files live:

| Backend | Storage | Cross-thread? | When to use |
|---|---|---|---|
| `StateBackend` | LangGraph state (`files` channel), checkpointed | No | Default; ephemeral within a conversation |
| `StoreBackend` | LangGraph `BaseStore` (`InMemoryStore`, Postgres) | Yes | Cross-session memory under `/memories/` |
| `FilesystemBackend(root_dir=, virtual_mode=)` | Real disk | Yes | Coding agents on real projects |
| `LocalShellBackend` | Disk + local shell | Yes | Coding agents that need `execute` |
| `ContextHubBackend` | LangSmith Hub agent repo (commits) | Yes | LangSmith-native durable storage |
| `CompositeBackend(default=, routes=)` | Routes by path prefix | Mixed | Production pattern |
| Sandbox backends (LangSmith, Daytona, Modal, Runloop, AgentCore) | Remote sandbox VM with shell | Yes | Production code execution |

Canonical production pattern with `CompositeBackend`:

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

def make_backend(rt):
    return CompositeBackend(
        default=StateBackend(rt),                  # ephemeral
        routes={"/memories/": StoreBackend(rt)},    # persistent across threads
    )

agent = create_deep_agent(
    store=InMemoryStore(),                          # required for StoreBackend
    backend=make_backend,
    system_prompt="Save durable findings to /memories/.",
)
```

#### Pillar 4 — Sub-agents (`SubAgentMiddleware`, `AsyncSubAgentMiddleware`)

Three sub-agent shapes, all routed through the `task` tool:

```python
class SubAgent(TypedDict):
    name: str
    description: str
    system_prompt: str
    tools: NotRequired[Sequence[BaseTool | Callable | dict[str, Any]]]
    model: NotRequired[str | BaseChatModel]
    middleware: NotRequired[list[AgentMiddleware]]
    interrupt_on: NotRequired[dict[str, bool | InterruptOnConfig]]
    skills: NotRequired[list[str]]

class CompiledSubAgent(TypedDict):     # any pre-compiled LangGraph CompiledStateGraph
    name: str
    description: str
    runnable: Runnable                  # state schema must include `messages`

class AsyncSubAgent(TypedDict):         # background agent over Agent Protocol
    name: str
    description: str
    graph_id: str
    url: NotRequired[str]
    headers: NotRequired[dict[str, str]]
```

The `task` tool's verbatim description (`TASK_TOOL_DESCRIPTION` in `subagents.py`): *"Launch an ephemeral subagent to handle complex, multi-step independent tasks with isolated context windows ... Launch multiple agents concurrently whenever possible ... Each agent invocation is stateless ... your prompt should contain a highly detailed task description ... When only the general-purpose agent is provided, you should use it for all tasks."* It includes few-shot examples drawn from Claude Code's playbook (LeBron/MJ/Kobe research-in-parallel, security-report single-subagent, pizza-and-burger anti-example).

Every deep agent automatically gets a built-in `general-purpose` sub-agent — a clone of the parent — whose description begins: *"General-purpose agent for researching complex questions, searching for files and content, and executing multi-step tasks ... When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent."*

**Context quarantine** is enforced literally. `_EXCLUDED_STATE_KEYS = {"messages", "todos", "structured_response", "skills_metadata", "memory_contents"}`. The child gets a clean message history seeded only with the parent's `task` description. `messages` is handled explicitly to extract just the child's *final* message back as a `ToolMessage`. `todos` aren't shared (each sub-agent maintains its own list).

**Async sub-agents (v0.5).** Inline sub-agents block the parent. For long-running work, `AsyncSubAgent` runs the child on a remote Agent-Protocol server and exposes five tools to the parent: `start_async_task`, `check_async_task`, `update_async_task`, `cancel_async_task`, `list_async_tasks`. Metadata persists in a dedicated `async_tasks` state channel (separate from messages so it survives compaction). When `url` is omitted and graphs co-deploy in one `langgraph.json`, the SDK uses ASGI transport (in-process, zero network). Chase in the v0.5 announcement: *"Inline subagents are effective for short, focused tasks, but they block the supervisor's execution loop while they run. For work that takes minutes rather than seconds — deep research, large-scale code analysis, multi-step data pipelines — this becomes a bottleneck."*

#### The other middleware

- **`SummarizationMiddleware`** — when running history exceeds a model-aware token threshold, replaces the older prefix with an LLM-generated summary. Exposes a manual `compact_conversation` tool.
- **`PatchToolCallsMiddleware`** — fixes the "dangling tool call" problem: after an interrupt or summarization, the history may contain an `AIMessage` with tool calls but no matching `ToolMessage`. Injects synthetic tool responses.
- **`AnthropicPromptCachingMiddleware`** — attaches `cache_control` breakpoints to the static prefix (system prompt + tool definitions) so Claude's 90%-discounted cache reads apply. Auto-included; no-ops on non-Anthropic.
- **`MemoryMiddleware`** — opt-in via `memory=["./AGENTS.md", ...]`. Loads `AGENTS.md` at session start and injects into the system prompt. Marked `PrivateStateAttr` so it doesn't leak to sub-agents. Strictly forbids writing credentials.
- **`SkillsMiddleware`** — opt-in via `skills=["./skills/", ...]`. **Progressive disclosure**: skills are folders containing `SKILL.md` with YAML frontmatter. Only names and descriptions are loaded up front; full content is fetched on demand via filesystem reads. Claude Code's Skills pattern, ported.
- **`HumanInTheLoopMiddleware`** — attached when `interrupt_on=...` is provided. Pauses execution via LangGraph's `interrupt()`; resumes with `Command(resume={"decisions": [{"type": "approve"|"edit"|"reject", ...}]})`. **Requires a checkpointer.**
- **`HarnessProfile` / `ProviderProfile`** (v0.5.3+) — declarative bundles of per-model config that `create_deep_agent` applies automatically when a matching model is selected. Used to ship per-provider system-prompt suffixes, tool-description overrides, and extra middleware without changing call sites.

#### Customization surface (full)

```python
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[my_search, my_fetcher],
    system_prompt=SystemMessage(content=[
        {"type": "text", "text": "You are a research analyst."}
    ]),
    subagents=[research_subagent, critic_subagent],
    skills=["./skills/"],
    memory=["./AGENTS.md"],
    permissions=[FilesystemPermission(path="/secrets/**", read=False, write=False)],
    backend=make_backend,
    interrupt_on={
        "write_file": True,
        "edit_file": {"allowed_decisions": ["approve", "edit", "reject"]},
        "execute": True,
    },
    response_format=MyPydanticSchema,
    context_schema=MyRunContext,
    checkpointer=PostgresSaver(...),
    store=InMemoryStore(),
    middleware=[CopilotKitMiddleware(), MyAuditMiddleware()],
    name="research-deep-agent",
    debug=False,
)
```

Anything `create_agent` accepts (`response_format`, `context_schema`, `checkpointer`, `store`, `debug`, `name`, `cache`) passes through unchanged — deep agents are LangGraph graphs and inherit everything that means.

#### Reference implementations

- **`deepagents-code` / `dcode`** — the CLI coding agent. `curl -LsSf https://langch.in/dcode | bash`. File ops, shell execution, optional remote sandboxes (LangSmith / Daytona / Modal / Runloop / AgentCore), Tavily web search, persistent per-agent memory under `~/.deepagents/<agent>/memories/`, MCP server discovery. OpenAI/Anthropic/Google by default; Ollama/Groq/xAI as extras.
- **`deepagents-cli`** (`0.1.0+`) — deployment subcommands only: `deepagents init`, `deepagents dev`, `deepagents deploy`.
- **`open_deep_research`** — the canonical "Deep Research" example in `examples/deep_research`. Custom workflow (save_request → write_todos → delegate → synthesize → respond) with research-specific delegation rules.
- **`better-harness`** — research artifact showing one Deep Agent improving another with evals.
- **`async-deep-agents`** — supervisor + researcher + coder, all separate graphs in one `langgraph.json`, demonstrating ASGI-transport async sub-agents.
- **`deepagents-ui`** — frontend for inspecting a deep agent's todos, files, and message stream in real time.

#### Production considerations

- **Token usage.** Deliberately context-heavy. Plan for prompt-caching (Anthropic) or Responses API (OpenAI, default since v0.4).
- **Models.** Default `claude-sonnet-4-6` (per `_build_default_model` in graph.py). In practice Sonnet 4.5+ and GPT-5-class are where the harness "works" — weaker models can't follow the long prompt and trip on `write_todos`/`task` discipline. The April 29, 2026 *Tuning Deep Agents to Work Well with Different Models* post and `HarnessProfile` exist because Sonnet's, GPT's, and Gemini's preferred prompt styles differ.
- **Latency.** Each model call has the full base prompt + middleware suffixes + tool definitions, so prompt-cache hit rate matters enormously. Sub-agents serialize unless you fan out via parallel `task` calls.
- **Durability.** `interrupt_on` *requires* a checkpointer. For production, use `PostgresSaver` / `AsyncPostgresSaver`. `deepagents deploy` packages this on LangSmith Deployments.
- **Observability.** LangSmith tracing is first-class; every model call, tool call, sub-agent invocation, and middleware hook becomes a span. Set `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY`.
- **Security.** README: *"Deep Agents follows a 'trust the LLM' model. The agent can do anything its tools allow. Enforce boundaries at the tool/sandbox level, not by expecting the model to self-police."* Use sandbox backends, `FilesystemPermission` ACLs, and `interrupt_on` HITL on destructive tools.

#### Comparison with other harnesses

| | Deep Agents | Claude Agent SDK | OpenAI Agents SDK | AutoGen | CrewAI | smolagents |
|---|---|---|---|---|---|---|
| Model agnostic | **Yes** | Claude-only | Mostly OpenAI | Multi | Multi | Multi |
| Built on graph runtime | LangGraph | No (loop) | No (handoffs) | Group chat | Crew/Process | Loop |
| Durable execution | Yes | No | No | No | No | No |
| Built-in filesystem | Yes | Yes | No | No | No | Optional |
| Built-in planner tool | `write_todos` | `TodoWrite` | No | No | Tasks | No |
| Sub-agents | Sync + async | Yes | "Handoffs" | "Agents" | "Crew" | No |
| HITL | First-class | Limited | Limited | Manual | Manual | No |
| Production runtime | LangSmith Deployment | Anthropic API | OpenAI API | Manual | Manual | Manual |
| Philosophy | "Trust the LLM, batteries-included" | "Trust the LLM, Claude-tuned" | Lightweight, handoffs | Conversational multi-agent | Role-based crews | Minimalist |

In short: Deep Agents and Claude Agent SDK converge on the *same recipe* — it's what made Claude Code general-purpose — but Deep Agents is model-agnostic and runs on LangGraph, while Claude Agent SDK is the in-house version tuned for Claude only. Chase's April 2025 LinkedIn post specifically critiqued OpenAI's handoff-style multi-agent guidance over a single ReAct-style loop.

### A complete worked example

End-to-end research-and-write agent exercising every major feature: custom tools, multiple specialized sub-agents, HITL approval, a custom state-schema extension, an `after_model` middleware (the modern `post_model_hook` replacement), a Postgres checkpointer, streaming, LangSmith tracing, and a `/memories/` route into a `StoreBackend`.

```python
"""
research_agent.py — a substantive deep-research agent exercising:
  * create_deep_agent factory (Phase-3 harness)
  * Custom tools (LangChain @tool, Phase-1 abstraction)
  * Custom sub-agents (SubAgentMiddleware, context quarantine)
  * Virtual filesystem (FilesystemMiddleware) + CompositeBackend with /memories/ routing
  * HITL via interrupt_on + PostgresSaver checkpointer (LangGraph runtime)
  * Custom middleware (after_model hook) — modern post_model_hook replacement
  * Streaming via stream_mode="updates" + LangSmith tracing
"""
import os
from typing import Annotated
from typing_extensions import TypedDict, NotRequired

from langchain_core.tools import tool
from langchain.agents.middleware import AgentMiddleware
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.memory import InMemoryStore
from langgraph.types import Command

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from tavily import TavilyClient

os.environ.setdefault("LANGSMITH_PROJECT", "deep-research-agent")
# LANGSMITH_TRACING=true and LANGSMITH_API_KEY must be set in env.

# ── 1. Custom tools ─────────────────────────────────────────────────────────
tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

@tool
def web_search(query: str, max_results: int = 5) -> str:
    """Search the web. Returns concatenated (title, url, content)."""
    rs = tavily.search(query, max_results=max_results, include_raw_content=False)
    return "\n\n".join(f"[{r['title']}]({r['url']})\n{r['content']}" for r in rs["results"])

@tool
def publish_report(path: str, recipients: list[str]) -> str:
    """Publishes a finalized report. DESTRUCTIVE — guarded by interrupt_on."""
    return f"Published {path} to {', '.join(recipients)}."

# ── 2. Sub-agent specs — three specialists with quarantined context ─────────
RESEARCHER = {
    "name": "researcher",
    "description": "Use to perform a self-contained deep search on a single sub-topic.",
    "system_prompt": (
        "You are a meticulous research analyst. For the given sub-topic: "
        "(1) plan with write_todos, (2) run 3-5 web_searches, "
        "(3) read promising sources, (4) write findings to /research/<topic>.md, "
        "(5) return a 250-word synthesis with inline citations."
    ),
    "tools": [web_search],
}
CRITIC = {
    "name": "critic",
    "description": "Critique a draft for factual gaps and weak claims.",
    "system_prompt": (
        "You are a skeptical editor. Read the draft at the path given. Return a "
        "bulleted list of (a) unsupported claims, (b) missing counter-evidence, "
        "(c) suggested follow-up searches."
    ),
}
WRITER = {
    "name": "writer",
    "description": "Compose the final report from research notes.",
    "system_prompt": (
        "You are a senior technical writer. Read /research/*.md, then write a "
        "structured report to /reports/final.md: TL;DR, Key Findings, Details, "
        "Recommendations, Caveats. Use inline citations."
    ),
}

# ── 3. Custom state extension ───────────────────────────────────────────────
class ResearchState(TypedDict, total=False):
    research_queries_run: Annotated[NotRequired[list[str]], list.__add__]

# ── 4. Custom middleware: logs every model call's token cost ────────────────
class CostLoggerMiddleware(AgentMiddleware):
    """Modern equivalent of post_model_hook: an after_model wrapper."""
    def after_model(self, state, response):
        usage = getattr(response, "usage_metadata", None) or {}
        # Log to LangSmith trace metadata; structure depends on your tracer.
        return {"messages": [response]}

# ── 5. Backend: ephemeral state for scratchpad, persistent store for memory ─
def make_backend(rt):
    return CompositeBackend(
        default=StateBackend(rt),
        routes={"/memories/": StoreBackend(rt)},
    )

# ── 6. The agent ────────────────────────────────────────────────────────────
with PostgresSaver.from_conn_string(os.environ["PG_URL"]) as checkpointer:
    checkpointer.setup()
    agent = create_deep_agent(
        model=init_chat_model("anthropic:claude-sonnet-4-6", temperature=0),
        tools=[web_search, publish_report],
        system_prompt=(
            "You are a Deep Research Lead. Your workflow is ALWAYS:\n"
            "  1. Save the user's request verbatim to /research/request.md.\n"
            "  2. write_todos with a 5-10 step plan.\n"
            "  3. For each independent sub-topic, dispatch a `researcher` "
            "subagent in parallel.\n"
            "  4. Dispatch the `writer` subagent to compose /reports/final.md.\n"
            "  5. Dispatch the `critic` subagent on /reports/final.md.\n"
            "  6. Revise once based on critique. Save durable lessons to /memories/.\n"
            "  7. Call publish_report ONLY after explicit user approval.\n"
        ),
        subagents=[RESEARCHER, CRITIC, WRITER],
        backend=make_backend,
        store=InMemoryStore(),
        memory=["./AGENTS.md"],
        skills=["./skills/"],
        interrupt_on={
            "publish_report": True,
            "write_file": {"allowed_decisions": ["approve", "edit"]},
        },
        middleware=[CostLoggerMiddleware()],
        checkpointer=checkpointer,
        context_schema=ResearchState,
        name="deep-research-agent",
    )

    # ── 7. Run, with streaming ──────────────────────────────────────────────
    cfg = {"configurable": {"thread_id": "demo-run-1"}, "recursion_limit": 200}
    user_query = "Compare LangGraph, AutoGen, and CrewAI for long-horizon coding agents."

    for chunk in agent.stream(
        {"messages": [{"role": "user", "content": user_query}]},
        stream_mode="updates", config=cfg,
    ):
        # `updates` mode yields {node_name: state_delta} per superstep.
        print(chunk)

    # ── 8. Resume after HITL pause on publish_report ────────────────────────
    resume_payload = Command(resume={"decisions": [{"type": "approve"}]})
    for chunk in agent.stream(resume_payload, stream_mode="updates", config=cfg):
        print(chunk)
```

**How state evolves.** After step 3 the state looks like:

```python
{
  "messages": [SystemMessage(...), HumanMessage("Compare ..."),
               AIMessage(tool_calls=[write_todos, task, task, task]),
               ToolMessage(...) * 3],
  "todos": [
    {"content": "Save request", "status": "completed"},
    {"content": "Plan",         "status": "completed"},
    {"content": "Research LangGraph", "status": "in_progress"},
    {"content": "Research AutoGen",   "status": "in_progress"},
    {"content": "Research CrewAI",    "status": "in_progress"},
    {"content": "Synthesize", "status": "pending"},
    {"content": "Critique",   "status": "pending"},
    {"content": "Publish",    "status": "pending"},
  ],
  "files": {"/research/request.md": FileData(content="Compare ...")},
}
```

After the three parallel `task(researcher, ...)` calls complete, each child returned only its *final message* (the 250-word synthesis), and three new files appeared in `state["files"]` under `/research/`. Their internal tool-call chatter never touched the parent's `messages` — that is `_EXCLUDED_STATE_KEYS` at work. Then `publish_report` triggers `interrupt_on`; LangGraph writes a checkpoint and yields an interrupt to the caller; the user approves via the UI; `Command(resume={"decisions":[{"type":"approve"}]})` resumes from exactly that checkpoint. If the process had crashed during publish, `agent.invoke(None, config=cfg)` after restart would pick up at the same checkpoint — *durable execution*.

## Recommendations

**Stage 0 — Decide your layer.**

- *Need a custom graph topology (non-ReAct, parallel deterministic stages, cycles between specialized nodes)?* → Drop to **LangGraph** directly. `create_react_agent` is itself a graph; build your own.
- *Standard tool-calling agent, lean dependency surface?* → Use **`langchain.create_agent`** with the specific middleware you need.
- *Long-horizon, complex, would benefit from planning, sub-agents, and file-based context offloading?* → Use **`deepagents.create_deep_agent`**. Right default for Deep-Research clones, coding agents, GTM agents, codebase-explorer agents, SRE agents.

**Stage 1 — Working prototype in <30 minutes.** `uv add deepagents`, write 10 lines, run. Default model (`claude-sonnet-4-6`) and default middleware get you 80% of the way. Resist customizing the prompt; first try expressing domain logic in `system_prompt=` as natural language. Chase at ODSC AI West 2025: *"Put all complexity in the prompt. Don't add pre-processing steps or wrapper logic. Describe what you want in natural language and let the model handle it."*

**Stage 2 — Add structure only when you measure a problem.**

- Agent forgets steps → add explicit planning rules to `system_prompt`.
- Context blows up → already covered by the 20k-token eviction default; tune `tool_token_limit_before_evict` only with measurement.
- Sub-tasks contaminate each other's reasoning → declare a `SubAgent`. Chase: *"People reach for subagents too soon. If your prompt is 20 lines, expand it — don't outsource it."*
- Need persistent knowledge across sessions → route `/memories/` to a `StoreBackend`; add an `AGENTS.md` via `memory=`.

**Stage 3 — Production hardening.**

- Replace `MemorySaver` with `PostgresSaver` or LangSmith Deployment's managed equivalent.
- Add `interrupt_on={...}` for any destructive tool (deletes, emails, payments, irreversible actions).
- Move shell execution into a sandbox backend (Daytona, Modal, Runloop, LangSmith Sandbox); never let a deep agent execute arbitrary shell on your build server.
- `AnthropicPromptCachingMiddleware` is automatic on Anthropic; make sure static prefix is large enough (>1024 tokens) and dynamic content goes *last*.
- Wire LangSmith: `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY=...`, `LANGSMITH_PROJECT=...`.
- For tasks >60 seconds, convert hot sub-agents to `AsyncSubAgent` and co-deploy with the supervisor in one `langgraph.json` for ASGI transport.
- One-command deploy: `deepagents init`, `deepagents dev`, `deepagents deploy`.

**Thresholds that change a recommendation.**

- Request fits in <2 model turns and <2k tokens of output → don't use Deep Agents; use plain LCEL or `create_agent`.
- Task involves <5 tool calls, no branching → `create_agent` is enough.
- Task makes >20 tool calls, runs >2 minutes, or has multi-step dependencies → deep agents pay off.
- Task runs >2 minutes per sub-task → convert sub-agents to async.
- Context-window errors in LangSmith traces → below 20k eviction threshold or not enabling prompt caching — both fixable, neither a reason to abandon the harness.

## Caveats

- **Versioning churn.** The deepagents API shifted materially between v0.4 (original Claude-Code-clone, with `instructions=`/`builtin_tools=`, separate `async_create_deep_agent`) and v0.5+ (middleware-composition rewrite, with `system_prompt=`, `memory=`, `skills=`, `permissions=`, harness profiles). Tutorials older than ~Feb 2026 use deprecated parameter names. Factory *behavior* is stable; *parameter names* aren't.
- **Default model drift.** DeepWiki and several blog posts still cite `claude-sonnet-4-20250514` as the default. Current `_build_default_model` in `graph.py` returns `ChatAnthropic(model_name="claude-sonnet-4-6")`.
- **The CLIs are two separate packages.** Interactive coding agent: `deepagents-code` / `dcode`. Deployment toolkit: `deepagents-cli` (`init`/`dev`/`deploy`). They were unified earlier in 2025 and split again as of `deepagents-cli==0.1.0`.
- **README has been trimmed.** As of May 2026 the GitHub README is short marketing; canonical source for the middleware stack and parameter semantics is the `create_deep_agent` docstring and `docs.langchain.com/oss/python/deepagents/`.
- **"Trust the LLM" is the explicit security model.** This is not a sandbox; it's a harness calling whatever tools you wire to it. Production deployments must enforce permissions *at the tool* (sandbox backends, `FilesystemPermission` rules, `interrupt_on`), not in the prompt.
- **Sub-agent config-propagation bug.** As of Feb 2026 (Issue #1251), `config["configurable"]` passed to the main agent is not forwarded into sub-agent invocations, so `InjectedToolArg` parameters land as `None` in sub-agent tools.
- **Sub-agent recursion limit is *not* inherited.** Main agent has `recursion_limit=9_999`; sub-agents fall back to LangGraph's default of 25. Long sub-agent runs can fail silently — set the limit explicitly in your sub-agent's middleware.
- **Heterogeneous claims about Claude Code's prompt length.** Chase says "nearly 2,000 lines"; decompositions of the Claude Code v2.0.14 binary count ~2,900 base tokens + 11,438 for tool definitions. Both can be true depending on what is being counted. Signal is the same: long, structured, examples-rich prompts are how harnesses get reliability out of frontier models.