# Deep Agents research brief (2026-06-10)

Sources: docs.langchain.com (JS + Python deepagents sections), github.com/langchain-ai/deepagents (Python monorepo), github.com/langchain-ai/deepagentsjs (JS monorepo), npm `deepagents`, LangChain blog. Current versions as of today: **Python `deepagents==0.6.8`** (Jun 3), **JS `deepagents@1.10.2`** (May 13, npm latest). Both repos pushed within the last 24h.

---

## 1 · What deep agents are (the pitch, in the docs' own framing)

- Tagline (both repos): **"The batteries-included agent harness."**
- README framing: *"Deep Agents is an open source agent harness — an opinionated agent that runs out of the box. Extend, override, or replace any piece."* Principles: **Opinionated** (defaults tuned for long-horizon, multi-step work), **Extensible**, **Model-agnostic** (any tool-calling LLM, incl. open-weight/local), **Production-ready** (built on LangGraph, first-class LangSmith).
- Positioning in the stack (README FAQ): *"LangGraph is the graph runtime. LangChain's `create_agent` is a minimal agent harness on top of it. Deep Agents is a more opinionated harness on top of `create_agent` — same building blocks, but with filesystem, sub-agents, context management, and skills bundled in."* Any compiled LangGraph graph can be passed as a subagent.
- Acknowledgement: *"Inspired by Claude Code: an attempt to identify what makes it general-purpose, and push that further."*
- Security model (quotable): *"Deep Agents follows a 'trust the LLM' model. The agent can do anything its tools allow. Enforce boundaries at the tool/sandbox level, not by expecting the model to self-police."*
- Docs overview (https://docs.langchain.com/oss/javascript/deepagents/overview) lists ~15 capabilities: planning (`write_todos`), context management (summarization + offloading), tools & MCP, pluggable filesystem backends, shell execution (`execute`), interpreters (QuickJS `eval`), subagents (`task`) + **async subagents**, typed event streaming, long-term memory, filesystem permissions, HITL, skills, smart defaults, virtual filesystem, prompt caching.

---

## 2 · Architecture & current API surface (JS first, Python deltas)

### 2.1 `createDeepAgent(options)` — JS (deepagents@1.10.x)

| Option | Type / notes |
|---|---|
| `model` | string `"provider:model"` (e.g. `"anthropic:claude-sonnet-4-6"`) or chat-model instance |
| `systemPrompt` | string \| SystemMessage — composed as **USER + (BASE or profile CUSTOM) + SUFFIX** |
| `tools` | LangChain tools (Zod schemas); MCP via `@langchain/mcp-adapters` |
| `middleware` | `AgentMiddleware[]`, inserted at a fixed slot in the default stack |
| `subagents` | `(SubAgent \| CompiledSubAgent \| AsyncSubAgent)[]` |
| `skills` | `string[]` — **paths into the backend** (e.g. `["/skills/"]`), not inline objects. Direct skill-dir paths supported since Jun 7 (#242) |
| `memory` | `string[]` — paths to `AGENTS.md` files, **always loaded** into the system prompt (no progressive disclosure) |
| `backend` | `BackendProtocol \| BackendFactory` — default `(config) => new StateBackend(config)` |
| `permissions` | `FilesystemPermission[]` — glob `allow`/`deny` (and `interrupt` mode), **first-match-wins in declaration order** |
| `interruptOn` | `Record<string, boolean \| InterruptOnConfig>` per tool; `{ allowedDecisions: [...] }` |
| `responseFormat` | structured output schema |
| `stateSchema` | custom state (added Jun 2, #569); shared `filesValue` ReducedValue exported for file-state merging |
| `contextSchema` / runtime `context` | per-run config; propagates to all subagents; namespaced keys convention (`"researcher:maxDepth"`) |
| `checkpointer` | required for HITL |
| `store` | for `StoreBackend`; auto-provisioned on LangSmith Deployment |

Python `create_deep_agent` is the same surface in snake_case (`system_prompt`, `interrupt_on`, `state_schema`, `context_schema`, `response_format`) plus `debug`, `name`, `cache` (https://docs.langchain.com/oss/python/deepagents/customization).

Returns a **compiled LangGraph graph** — `.invoke / .stream / streamEvents`, Studio, checkpointers all work.

### 2.2 Default middleware stack (exact names, in order — same both languages)

1. `TodoListMiddleware`
2. `SkillsMiddleware` (if `skills`)
3. `FilesystemMiddleware`
4. `SubAgentMiddleware`
5. `SummarizationMiddleware` (deepagents' own, backend-aware)
6. `PatchToolCallsMiddleware` (repairs dangling tool calls after interrupts)
7. `AsyncSubAgentMiddleware` (if async subagents)
8. **user middleware**
9. profile extras (per-model)
10. excluded-tool filtering
11. `AnthropicPromptCachingMiddleware` (Anthropic only; since Jun 2 gated on per-call `request.model`, #551)
12. `MemoryMiddleware` (if `memory`)
13. `HumanInTheLoopMiddleware` (if `interruptOn`)

JS source: `libs/deepagents/src/middleware/{fs,subagents,summarization,skills,memory,agent-memory,async_subagents,patch_tool_calls,cache,completion_callback}.ts`.

### 2.3 Built-in tools (exact names)

- `write_todos` — plan tracking
- `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep` — filesystem (all backends; `read_file` natively returns **multimodal content** for images/PDF/audio/video with `mimeType` + bytes)
- `task` — sync subagent delegation (only attached when ≥1 sync subagent, but GP subagent exists by default so it's effectively always there)
- `execute` — shell (only `LocalShellBackend` + sandbox backends)
- `eval` — TypeScript in persistent QuickJS context (only with `createCodeInterpreterMiddleware()` from `@langchain/quickjs`); PTC allowlist exposes tools as `tools.camelCase(...)` async fns
- Async-subagent tools: `start_async_task`, `check_async_task`, `update_async_task`, `cancel_async_task`, `list_async_tasks`

### 2.4 Default base prompt (JS `agent.ts`, current `main`)

`BASE_AGENT_PROMPT` opens: *"You are a Deep Agent, an AI assistant that helps users accomplish tasks using tools."* Sections: **Core Behavior** ("NEVER add unnecessary preamble… Don't say 'I'll now do X' — just do it"), **Professional Objectivity** ("Prioritize accuracy over validating the user's beliefs"), **Doing Tasks** ("Understand first → Act → Verify… Your first attempt is rarely correct — iterate"; "Keep working until the task is fully complete"), **Progress Updates**. Tool-specific prompt text is injected per-middleware (todos, fs, task), not in the base prompt.

### 2.5 Backends (exact identifiers)

Docs: https://docs.langchain.com/oss/javascript/deepagents/backends

- `StateBackend` — **default**; thread-scoped, lives in LangGraph state/checkpoints.
- `FilesystemBackend({ rootDir, virtualMode })` — real disk; `virtualMode: true` blocks `..`/`~`/absolute escapes.
- `LocalShellBackend({ workingDirectory, timeout=120s, max_output_bytes=100000, env, inherit_env })` — FilesystemBackend + `execute`; **no sandboxing**, HITL "strongly recommended".
- `StoreBackend({ namespace: (rt) => [...] })` — durable cross-thread via LangGraph `BaseStore`; namespace factories per-user (`rt.serverInfo.user.identity`), per-assistant (`rt.serverInfo.assistantId`), per-thread (`rt.executionInfo.threadId`).
- `ContextHubBackend("owner/name")` — **new in v0.6 (May 12, #533)**; files stored as LangSmith Hub commits → version history on every write. Needs `LANGSMITH_API_KEY`.
- `CompositeBackend(defaultBackend, { "/memories/": …, "/workspace/": … })` — prefix routing, **longest prefix wins**; `ls/glob/grep` aggregate across routes; internal data (offloads, history) goes to the default route.
- Sandbox backends (partner packages): `@langchain/modal`, `langchain-daytona`, `langchain-runloop`, Deno, `@langchain/node-vfs` (`VfsSandbox`, filesystem-only since Jun 2 #575), LangSmith sandboxes (snapshot/start/stop lifecycle, #479). All add `execute`.
- Custom backends implement **`BackendProtocolV2`**: `ls, read(path, offset?, limit?), readRaw, grep(pattern, path?, glob?), glob(pattern, path?), write, edit(path, oldString, newString, replaceAll?)` — each result has optional `error`.

### 2.6 Subagents

Docs: https://docs.langchain.com/oss/javascript/deepagents/subagents

`SubAgent` fields: `name`, `description`, `systemPrompt` (required, **not inherited**), `tools` (optional — **replaces** parent's entirely), `model` (inherits if omitted), `middleware` (appended to default subagent stack), `interruptOn` (inherits parent, overridable), `skills` (NOT inherited — only the GP subagent gets parent skills), `responseFormat`, `permissions` (inherits; replaces if specified). `CompiledSubAgent`: `{ name, description, runnable }` for arbitrary compiled graphs. Every agent gets an auto **`general-purpose`** subagent (inherits parent model/tools/skills); replace by supplying `name: "general-purpose"`, or disable via the harness profile's `GeneralPurposeSubagentProfile(enabled=False)` (Python identifier). Subagent default middleware: Filesystem + Summarization + (own Skills) + custom.

**Async subagents** (`AsyncSubAgent`: `name`, `description`, `graphId`, `url?`, `headers?`) run on an Agent Protocol server (remote or co-deployed); state tracked in dedicated `asyncTasks` channel that **survives compaction**; `update_async_task` does mid-flight steering.

### 2.7 Skills

Docs: https://docs.langchain.com/oss/javascript/deepagents/skills — follows the **Agent Skills standard**. A skill = directory with `SKILL.md` (YAML frontmatter `name` ≤64 chars matching dir, `description` ≤1024 chars, optional `metadata` incl. `entrypoint` for interpreter skills, `license`, `compatibility`, `allowed-tools`) + `scripts/`, `references/`, `assets/`. Three-level progressive disclosure: metadata at startup → full SKILL.md on activation → resources on demand (read via filesystem tools — **there is no `load_skill` tool**; the agent `read_file`s the skill). Best practices: SKILL.md <500 lines / <5k tokens; descriptions with activation keywords. Interpreter skills importable as `await import("@/skills/skill-name")` inside `eval`.

### 2.8 HITL

Docs: https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop. `interruptOn: { tool_name: true | { allowedDecisions: ["approve","edit","reject","respond"] } }`. Resume: `agent.invoke(new Command({ resume: { decisions: [{ type: "approve" } | { type: "edit", args } | { type: "reject", message } | { type: "respond", message }] } }), config)` — decisions array, same `thread_id`. `PatchToolCallsMiddleware` repairs history if interrupted mid-tool. Subagents: per-subagent `interruptOn` override, or tools call `interrupt()` directly.

### 2.9 Context engineering

Docs: https://docs.langchain.com/oss/javascript/deepagents/context-engineering. Summarization triggers at **85% of the model's `max_input_tokens`** (from model profile), preserves ~**10%** most-recent tokens; fallback when no profile: **170,000 tokens / keep 6 messages**. Produces a *structured summary (session intent, artifacts created, next steps)*. Tool outputs >**20,000 tokens** are auto-offloaded to the backend, replaced by file path + **first-10-line preview**; tool *inputs* get filesystem-pointer replacement at 85% capacity; images preserved. Memory = `AGENTS.md` paths, always-loaded. Prompt caching (Anthropic) caches base prompt + memory + skill metadata automatically.

### 2.10 Streaming (v0.6 flagship)

Docs: https://docs.langchain.com/oss/javascript/deepagents/event-streaming. `agent.streamEvents(input, { version: "v3" })` returns typed projections: `stream.messages`, `stream.toolCalls`, `stream.subagents` (each subagent exposes `name`, `messages`, `toolCalls`, nested `subagents`, `output`, `taskInput`). Consume projections concurrently for live UIs; raw namespace via `event.params.namespace`. Blog claims framework integrations for React/Vue/**Svelte**/Angular + an "Agent Streaming Protocol" and Streaming Cookbook.

### 2.11 Harness profiles & models

Docs: https://docs.langchain.com/oss/javascript/deepagents/models + harness page. Profiles = registered bundles of per-model defaults (prompt CUSTOM/SUFFIX, middleware extras, tool exclusions), keyed by provider or `provider:model` (JS impl May 11, #526). Built-ins for Anthropic + OpenAI; blog mentions profiles for open-weight Kimi K2.6, GLM 5.1, DeepSeek V4 and the claim *"harness-layer changes alone moved gpt-5.2-codex from 52.8% → 66.5%"*.

### 2.12 Python-only / JS-only deltas

- **Python-only**: `deepagents-cli` (deploy tooling; `state` deploy backend added Jun 7), **`deepagents-code`** (Claude-Code-style terminal agent, `curl -LsSf https://langch.in/dcode | bash`, docs at https://docs.langchain.com/oss/python/deepagents/cli/overview), **`deepagents-talon`** (experimental long-running local runtime host: channel adapters incl. WhatsApp, cron scheduler, MCP manifest loading — first release Jun 9), `deepagents-evals`, `create_rlm_agent` helper. Extra `create_deep_agent` params: `debug`, `name`, `cache`.
- **JS-only**: runtime entrypoints **`deepagents` (node) / `deepagents/browser` / `deepagents/node`** (added Jun 2, #574 — browser entrypoint omits Node-only exports like `FilesystemBackend`/`LocalShellBackend`); `@langchain/quickjs` `createCodeInterpreterMiddleware` (renamed from `REPLMiddleware` May 11, #531; swarm task tool added May 19 #500); changesets-based monorepo.
- Both: `deepagents-acp` (Agent Client Protocol server for Zed/JetBrains).

---

## 3 · Recent changes (last ~45 days)

**Releases**: Py `deepagents` 0.6.8 (Jun 3); `deepagents-code` 0.1.8→0.1.12 (Jun 2–10, near-daily); `deepagents-cli` 0.2.1/0.2.2; `deepagents-talon` 0.0.1 (Jun 9); `langchain-quickjs` 0.1.4, `langchain-modal` 0.0.5, `langchain-daytona` 0.0.7, `langchain-runloop` 0.0.6 (Jun 3). JS `deepagents` 1.9.1 (May 4) → 1.10.0 (May 5) → 1.10.2 (May 13); `@langchain/quickjs` 0.4.0.

**The v0.6 launch (blog, May 13, https://www.langchain.com/blog/deep-agents-0-6)** — five pillars: ① Code interpreter (QuickJS, PTC, recursive workflows; `deepagents[quickjs]` / `@langchain/quickjs`); ② Harness profiles (per-model tuning, open-weight focus); ③ Streaming v3 typed projections + framework integrations; ④ **Delta channels** (checkpoint diffs, "10-100x" storage reduction — 5.27 GB → 129 MB example); ⑤ `ContextHubBackend` (LangSmith Hub-versioned agent files). Announced alongside **LangSmith Engine, Managed Deep Agents (private preview/waitlist), SmithDB, Context Hub** at Interrupt 2026.

**JS repo highlights since ~Apr 25** (deepagentsjs): browser/node entrypoints (#574, Jun 2); `stateSchema` support (#569, Jun 2); composite route fanout scoping (#572); MIME fallback `application/octet-stream` (#541); cache_control gating per-call (#551); subagent `lc_agent_name` propagation (#566); direct skill paths in `createSkillsMiddleware` (#242, Jun 7); `VfsSandbox` made filesystem-only (#575); harness profiles (#526, May 11); ContextHubBackend (#533, May 12); streaming v3 support (#458, May 5); LangSmithSandbox lifecycle (#479).

**Python repo highlights**: almost all current churn is in **`libs/code`** (the terminal agent — TUI features, `/restart`, `/threads`, `/remember`, model-key pairing, subagent model switching, `get_current_thread_id` tool) and **Talon** (local runtime host, Jun 9 #3759). SDK-level: SummarizationMiddleware trigger-clause compatibility hotfix (#3827/3828, Jun 10).

Takeaway: the core harness API is stabilizing; active investment is in **products on top** (Code, Talon, Managed) and per-model performance (profiles).

---

## 4 · Examples folder inventory

### Python — github.com/langchain-ai/deepagents/tree/main/examples

| Example | What it builds | Features exercised |
|---|---|---|
| `deep_research/` | Multi-step web research (Tavily), notebook + `langgraph dev` server, pairs with **deep-agents-ui** repo | parallel subagents, strategic reflection, planning, streaming UI |
| `deploy-mcp-docs-agent/` | Docs research agent over LangChain docs | MCP tools |
| `deploy-coding-agent/` | Autonomous coding agent in a LangSmith sandbox | sandbox backend, `execute` |
| `nvidia_deep_agent/` | Nemotron research + GPU-accelerated execution via RAPIDS | custom model, sandbox compute |
| `content-builder-agent/` | Blog/LinkedIn/tweets writer | memory (`AGENTS.md`), skills, subagents |
| `text-to-sql-agent/` | NL→SQL on Chinook DB | planning, skill-based workflows |
| `llm-wiki/` | Script-first LLM wiki | `langsmith hub init/pull/push` (Context Hub) |
| `deploy-content-writer/` | Content writer service | per-user memory, Supabase auth, StoreBackend namespacing |
| `deploy-gtm-agent/` | GTM strategist | coordinating sync + async subagents |
| `async-subagent-server/` | Self-hosted Agent Protocol server exposing a researcher | async subagents, AsyncSubAgentMiddleware |
| `ralph_mode/` | Autonomous looping, fresh context per iteration | filesystem as persistence ("Ralph loop" pattern) |
| `rlm_agent/` | `create_rlm_agent`: recursive REPL+PTC subagent chain | CodeInterpreterMiddleware, PTC `tools.task(...)` parallel fan-out, CompiledSubAgent recursion |
| `repl_swarm/` | TS `swarm` skill dispatching parallel subagents from QuickJS | interpreter skills + PTC |
| `downloading_agents/` | "Agents as folders" — download zip, unzip, run | portable agent config |
| `better-harness/` | Eval-driven outer-loop optimization of a harness | evals, prompt/profile iteration |
| `talon-whatsapp/` | WhatsApp-channel long-running agent | Talon runtime |
| Featured | **Deep Agents Code** (`libs/code`) and **Open SWE** (separate repo) | the harness at production scale |

### JS — github.com/langchain-ai/deepagentsjs/tree/main/examples

| Example | Contents | Features |
|---|---|---|
| `research/` | `research-agent.ts` + `langgraph.json` | quickstart research agent, Tavily, deployable |
| `backends/` | `state-backend.ts`, `filesystem-backend.ts`, `local-shell-backend.ts`, `store-backend.ts`, `composite-backend.ts` | one file per backend type |
| `sandbox/` | `daytona-sandbox.ts`, `deno-sandbox.ts`, `langsmith-sandbox.ts`, `local-sandbox.ts`, `modal-sandbox.ts`, `vfs-backend.ts` | every sandbox flavor + `execute` |
| `skills/` | skill dirs: `arxiv-search`, `file-organizer`, `langgraph-docs`, `skill-creator`, `web-research` | SKILL.md format, progressive disclosure |
| `skills-memory/` | `skills-memory-agent.ts` | skills + AGENTS.md memory combined |
| `memory/` | `AGENTS.md` + `memory-agent.ts` | MemoryMiddleware |
| `repl/` | `data-analysis-agent.ts` ("QuickJS REPL as computational scratch pad… tasks where LLMs typically hallucinate: arithmetic, sorting, JSON transformation"), `rlm-agent.ts` | CodeInterpreterMiddleware, PTC, RLM |
| `streaming/` | `basic`, `tokens`, `tool-calls`, `filter-by-type`, `multi-mode`, `lifecycle`, `custom-updates`, `progress` | streamEvents v3 projections |
| `hierarchical/` | `hierarchical-agent.ts` | nested subagents |
| `async-subagents/` | `parallel-research/` | async subagent fan-out |
| `async-subagent-server/` | Hono `server.ts` + `supervisor.ts` REPL | Agent Protocol hosting |
| `acp-server/` | ACP server | Zed/JetBrains integration |

---

## 5 · Docs page map (JS; Python mirrors at /oss/python/deepagents/*)

| URL | One line |
|---|---|
| https://docs.langchain.com/oss/javascript/deepagents/overview | Pitch + 15-capability tour, ecosystem links |
| …/deepagents/quickstart | Install, Tavily research agent, model strings, built-ins |
| …/deepagents/customization | Full `createDeepAgent` option table, 13-middleware stack, prompt assembly (USER/BASE/SUFFIX) |
| …/deepagents/harness | Capability map: execution env / context mgmt / delegation / steering; profiles intro |
| …/deepagents/tools | Custom tools + MCP integration |
| …/deepagents/models | `provider:model` strings, `initChatModel`, ProviderProfile, recommended models |
| …/deepagents/backends | All 7 backend types, BackendProtocolV2, multimodal file support, security |
| …/deepagents/sandboxes | Modal/Daytona/Runloop/Deno/LangSmith sandboxes |
| …/deepagents/interpreters | QuickJS `eval`, `createCodeInterpreterMiddleware`, PTC options table |
| …/deepagents/permissions | Glob allow/deny(/interrupt), first-match-wins, subagent inheritance |
| …/deepagents/human-in-the-loop | `interruptOn`, 4 decision types, `Command({resume})`, PatchToolCalls |
| …/deepagents/subagents | SubAgent/CompiledSubAgent shapes, GP subagent, inheritance matrix |
| …/deepagents/async-subagents | AsyncSubAgent spec, 5 async tools, Agent Protocol |
| …/deepagents/event-streaming | streamEvents v3 typed projections |
| …/deepagents/skills | Agent Skills standard, SKILL.md, 3-level disclosure, skill permissions |
| …/deepagents/context-engineering | Summarization thresholds, offloading, AGENTS.md memory, caching |
| …/deepagents/going-to-production | Managed Deep Agents (private preview), LangSmith Deployment, threads/runs/store/checkpointer, MCP/A2A exposure |
| …/deepagents/comparison | vs Claude Agent SDK feature matrix |
| …/deepagents/code/overview | Deep Agents Code (terminal agent) |
| https://docs.langchain.com/oss/python/deepagents/cli/overview | CLI / Code docs (Python-only) |
| https://reference.langchain.com/javascript/modules/deepagents.html | API reference (JS); Python: reference.langchain.com/python/deepagents/ |

---

## 6 · Our local harness vs official

Local: `/Users/neo/LangX/src/lib/deepagents/` — a deliberately small, observable, browser-only re-implementation built on `@langchain/langgraph/web` StateGraph + ToolNode. Correspondence:

| Local file | Official counterpart | Match / divergence |
|---|---|---|
| `index.ts` `createDeepAgent` | `createDeepAgent` (agent.ts) | Same name/spirit. **Diverges**: local takes `instructions` (official: `systemPrompt`), `interruptOn: string[]` (official: per-tool config object), `memorySummary: string` (official: `memory: string[]` AGENTS.md paths), `compaction` (official: built-in SummarizationMiddleware, not exposed as an option), inline `skills: Skill[]` (official: backend paths), `maxIterations` (official: LangGraph recursionLimit via config). Local returns custom `{invoke/start/resume/state/subscribe}` handle; official returns a compiled LangGraph. Local has no `middleware`, `responseFormat`, `store`, `context`. |
| `prompt.ts` `BASE_AGENT_PROMPT`, `assembleSystemPrompt` | `BASE_AGENT_PROMPT` + prompt assembly | Local invented its own base prompt ("autonomous engineering agent…") and a `# BASE / # USER / # MIDDLEWARE / # SUFFIX` assembly. Official order is **USER first, then BASE, then SUFFIX**, and the official base prompt text is entirely different (see §2.4). Local injects todos/files listing into the system prompt every turn — official surfaces todos/files via tool results + state, not a prompt block. |
| `state.ts` | DeepAgentState (+ `filesValue`) | Local `todos`(replace)/`files`(merge)/`summarizationEvents`/`subagentReports` annotations. Official: `todos`, `files` as `Record<path, FileData>` with null-delete reducer; no `subagentReports` channel (subagent output returns as the `task` ToolMessage); `asyncTasks` channel exists officially. |
| `backends.ts` | backends/* | Local `BackendProtocol` = `read/write/delete/list` — official is **BackendProtocolV2** (`ls/read/readRaw/grep/glob/write/edit`, offset/limit, error fields). Local StateBackend ≈ official StateBackend (concept matches). Local StoreBackend(IndexedDB/Dexie) ≈ official StoreBackend(BaseStore) — good browser analogue. Local CompositeBackend: first-match routes + fallback — official: **longest-prefix wins** + default backend (note semantics differ!). Missing locally: FilesystemBackend, LocalShellBackend, ContextHubBackend, sandboxes, multimodal reads. |
| `compaction.ts` | SummarizationMiddleware + offloading | Local 3-tier (evict large tool results ≥1000 chars → truncate repeated args → model summarization at 85% of an 8k char-budget) with `/large_tool_results/` and `/conversation_history/` paths. Official: offload tool outputs **>20k tokens** with 10-line preview; summarize at **85% of model max_input_tokens**, keep 10%; fallback 170k/6 msgs; structured summary. The "truncate repeated arguments" tier is a local invention (official replaces tool *inputs* with filesystem pointers instead). Local `safeBoundary` mirrors official care about not splitting tool pairs. |
| `permissions.ts` | FilesystemPermission | Very close: glob, allow/deny, first-match-wins, default-allow. Official adds **`interrupt` mode** (route writes to HITL) and subagent inheritance semantics. |
| `skills.ts` (`load_skill` tool, inline body) | SkillsMiddleware + SKILL.md dirs | **Biggest divergence**: official has *no* `load_skill` tool — skills are directories on the backend; metadata injected at startup; the agent `read_file`s SKILL.md (3-level disclosure incl. scripts/references/assets, frontmatter spec). Local single-level `{name, description, body}` + enum-constrained tool is a pedagogical simplification. |
| `tokens.ts` | model profiles / real tokenizers | Local chars/4 estimator (self-documented as such). |
| `tools/filesystem.ts` | FilesystemMiddleware tools | Same six names `ls/read_file/write_file/edit_file/glob/grep`. Local `write_file` overwrites (official docs say **create-only semantics**); official `read_file` has offset/limit too, plus multimodal; official grep takes path/glob filters. |
| `tools/task.ts` | `task` tool / SubAgentMiddleware | Local `task({subagent, description})` vs official `task({subagent_type, description})` (note arg name `subagent_type`, visible in PTC examples). Local SubAgentSpec has `run()` callback; official runs real child agents with their own middleware stack; no general-purpose subagent locally. |
| `tools/todos.ts` | `write_todos` (TodoListMiddleware) | Same name + replace-whole-list semantics + pending/in_progress/completed. Matches well. |
| HITL in `index.ts` | HumanInTheLoopMiddleware | Local decisions: approve/reject/edit (single, inline). Official: decisions **array** in `Command({resume: {decisions}})`, adds **`respond`** type, `allowedDecisions` config, PatchToolCallsMiddleware repair. |

**Stale bit to flag in course prose**: any claim that "the official package doesn't run in the browser" is now outdated — `deepagents/browser` shipped Jun 2, 2026 (StateBackend/StoreBackend work in-browser; Node-only backends excluded). The hand-built harness remains justified for *teaching observability* (tracer, subscribe), but the framing should change from "we must" to "we choose to, to see inside".

---

## 7 · Existing Level-3 lessons & demos

Routes in `/Users/neo/LangX/src/routes/3-deepagents/` → demos in `/Users/neo/LangX/src/lib/demos/`:

| Route (title) | Demo | What it currently does / notes |
|---|---|---|
| `harness/` (The deep-agent harness) | `da-harness.ts` | Toggle-driven assembly (instructions, compaction on/off, HITL auto-approved) of one run with trace + files callbacks. Good "whole harness" opener; should absorb official middleware-stack vocabulary. |
| `todos/` (Planning with write_todos) | `da-todos.ts` | Two scenarios (research/refactor); live plan via `write_todos`. Matches official tool exactly. |
| `virtual-fs/` (The virtual filesystem) | `da-virtual-fs.ts` | organize/edit scenarios; live FS snapshot + before/after edits. Solid; could mention multimodal + create-only `write_file` deltas. |
| `backends/` (Backends) | `da-backends.ts` | "Memory steward" routing `/scratch/` (StateBackend) vs `/memories/` (IndexedDB StoreBackend) through CompositeBackend; IndexedDB survivor read-back. Great browser analogue; note official longest-prefix semantics + new ContextHubBackend/Filesystem/LocalShell/sandboxes. |
| `compaction/` (Context compaction) | `da-compaction.ts` | Tiny 600-token budget; scripted fetch_chunk pages force eviction then summarization; needle-retrieval proof. Lovely demo; numbers should be reconciled with official defaults (85% / 20k-token offload / 10-line preview). |
| `permissions/` (Filesystem permissions) | `da-permissions.ts` | 5 scripted writes against deny/allow/deny-all rule chain. Matches official semantics; missing `interrupt` mode. |
| `subagents/` (Subagents) | `da-subagents.ts` | researcher/writer/critic prompt-only subagents via `task`; reports stream back. Should add general-purpose subagent + inheritance rules + `subagent_type` naming. |
| `skills/` (Skills — progressive disclosure) | `da-skills.ts` | Inline cite/shrink skills + `load_skill` tool. **Most divergent from official** (SKILL.md dirs, no load_skill tool); needs reframing. |
| `hitl/` (Human-in-the-loop) | `da-hitl.ts` | Two write_file calls gated by interrupt; approve/reject/edit UI. Add `respond` decision + decisions-array shape. |
| `capstone-research/` (Capstone — Deep Research) | `da-capstone-research.ts` | Composite backend + researcher/writer/critic subagents producing a brief. Maps directly onto official `deep_research` example. |
| `capstone-data-science/` (Capstone — Data Science) | `da-capstone-data-science.ts` | `compute` (Worker-sandboxed JS over CSV) + `plot` (Observable Plot SVG) custom tools + report writing. Maps beautifully onto the official **interpreter/REPL** story now. |
| `recap/`, `beyond/` (Beyond V1) | — | Recap + outlook pages; "Beyond V1" is stale given v0.6: async subagents, interpreters, profiles, ContextHub, streaming v3, Code/Talon all exist now. |

---

## 8 · Teaching gold

- **The Claude Code lineage is official canon**: *"Inspired by Claude Code: an attempt to identify what makes it general-purpose, and push that further."* (README) — perfect lesson hook.
- **"Trust the LLM" security framing** — enforce at tool/sandbox level, never via prompt; pairs with permissions + sandbox lessons.
- **Layered-stack mental model** (FAQ): LangGraph = runtime → `create_agent` = minimal harness → Deep Agents = opinionated harness; layers compose (any compiled graph is a valid subagent).
- **Deterministic middleware ordering** is a design value: docs stress "when you customize behavior, the middleware ordering stays deterministic" — middleware slot #8 for user middleware.
- **Prompt assembly precedence**: USER comes *first*, then BASE/CUSTOM, then SUFFIX — user instructions outrank the harness's own.
- Base prompt gems: *"Don't say 'I'll now do X' — just do it"*; *"Your first attempt is rarely correct — iterate"*; *"Verify — check your work against what was asked, not against your own output."*
- **Gotchas**: custom subagents inherit *nothing* you'd expect (no tools, no skills, no systemPrompt) — only the GP subagent does; `tools` on a subagent *replaces* rather than extends; CompositeBackend longest-prefix-wins; `write_file` is create-only; HITL requires a checkpointer; `interruptOn` resume takes a *decisions array*; skills must keep frontmatter `name` == directory name; only one-level-deep reference chains in skills.
- **Why interpreters**: "tasks where LLMs typically hallucinate: arithmetic, statistics, sorting, JSON transformation" (repl example) — and PTC's pitch: one `eval` call can `Promise.all` many `tools.task(...)` delegations vs one tool call per turn (RLM README).
- **Eval-backed harness story**: "harness-layer changes alone moved gpt-5.2-codex from 52.8% → 66.5%" — the harness is a *tunable performance layer*, not just plumbing.
- **Delta channels** anecdote: 5.27 GB → 129 MB checkpoint storage for a coding session — concrete motivation for checkpoint design.
- Compaction trivia with exact numbers (85% trigger, keep 10%, 170k fallback, 20k-token offload with 10-line preview) — great quiz material.

---

## 9 · Capstone inspiration (deep research + data science)

**Deep research capstone** — official patterns to mirror:
- Python `examples/deep_research/` (Tavily search, parallel subagents, "strategic reflection", runs in Studio, pairs with https://github.com/langchain-ai/deep-agents-ui for a purpose-built deepagents UI showing todos/files/subagents — our course UI already does this in-browser!).
- JS `examples/research/research-agent.ts` (deployable single-file version) and `examples/async-subagents/parallel-research/` (fan-out via async subagents).
- Upgrade hooks: typed streaming projections (`stream.subagents`) for live per-subagent panes; `responseFormat` on a writer subagent for structured briefs; CompositeBackend with `/memories/` for cross-run research memory.

**Data-science capstone** — official patterns:
- JS `examples/repl/data-analysis-agent.ts`: QuickJS `eval` as the compute scratch pad over VFS data ("never guess at arithmetic"). Our `compute` Worker tool is the moral equivalent — could be reframed as "our browser stand-in for `createCodeInterpreterMiddleware`".
- `rlm_agent` / `repl_swarm`: PTC + recursive general-purpose subagents for parallel fan-out — an advanced "beyond" tease.
- Python `nvidia_deep_agent` (research + GPU compute) and `text-to-sql-agent` (skills-driven analysis workflows) for narrative inspiration.
- Skills angle: ship the capstone's analysis recipes as SKILL.md-style skills (`skill-creator` example in JS repo shows a skill that writes skills).
