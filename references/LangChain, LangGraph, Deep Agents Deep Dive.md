# **Architectural Evolution of Agentic Systems: From Simple Declarative Chains to Stateful Runtimes and Cognitive Agent Harnesses**

The development of software utilizing large language models has undergone a rapid paradigm shift, transitioning from simple API wrappers to highly autonomous, long-running systems. This evolution represents a change in how software engineers structure model-driven interactions, moving from static, linear input-output pipelines to dynamic, cyclic state machines, and ultimately to cohesive cognitive agent harnesses. Each architectural phase addresses specific limitations of the previous generation, introducing greater execution durability, more sophisticated token management, and broader operational horizons.  
An analysis of this progression reveals how the engineering requirements of large language model applications scale with complexity, culminating in the design of the Deep Agents SDK. This framework consolidates lower-level runtimes into an opinionated, operating-system-like harness.

| Architectural Phase | Primary Abstraction | Core Orchestration Pattern | State Management | Token Lifecycle Management | Core Focus |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Phase 1: Agent Frameworks** | Declarative Chains | Directed Acyclic Graphs | Stateless / Short-Term Memory | Manual Trimming / No Compaction | Standardizing developer onboarding and tool abstractions |
| **Phase 2: Agent Runtimes** | Stateful Graphs | Cyclic State Machines | Thread-Level checkpointers | Stateful Message Accumulation | Enforcing durable execution and human-in-the-loop flows |
| **Phase 3: Agent Harnesses** | Pluggable Scaffolding | Autonomous Operating System | Virtual Pluggable Filesystem | Automatic Multi-Tier Compaction | Managing long-horizon, complex tasks autonomously |

## **The Evolutionary Paradigm Shift in Model-Driven Software**

The transition of model-driven software engineering from simple completions to fully autonomous agent harnesses is driven by the structural demands of the applications themselves. Early patterns in large language model development treated the model as a text completion utility, where structural input produced a static text block. Over time, model provider APIs evolved from returning messages with basic content strings to returning complex multimodal structures, structured reasoning blocks, citations, and native tool-invocation payloads. This evolution necessitated a parallel shift in the software layers wrapping these models, moving from static serialization to dynamic execution loops.  
In the initial phase of this evolution, developer frameworks like LangChain focused on standardizing core building blocks, establishing unified message formats, and creating declarative chain interfaces to connect models with external tools. While highly effective for straightforward workflows, these linear pipelines lacked the structural flexibility required for autonomous, multi-step problem solving. The lack of a low-level orchestration engine that could manage state, handle runtime errors, and loop back after evaluating tool execution led to the second phase: the creation of stateful runtimes like LangGraph.  
`+------------------------------------------------------------+`  
`| Phase 1: Declarative Chains (LangChain)                    |`  
`| [Input] ---> ---> [LLM] ---> [Output]    |`  
`+------------------------------------------------------------+`  
                             `|`  
                             `v`  
`+------------------------------------------------------------+`  
`| Phase 2: Stateful Cyclic Graphs (LangGraph)                |`  
`|           +------------ Node (LLM) ------------+           |`  
`|           |                                    |           |`  
`|           v                                    v           |`  
`|    Conditional Edge                     Unconditional Edge |`  
`|           |                                    |           |`  
`|           +----------> Node (Tools) <----------+           |`  
`+------------------------------------------------------------+`  
                             `|`  
                             `v`  
`+------------------------------------------------------------+`  
`| Phase 3: Autonomous Agent Harnesses (Deep Agents)          |`  
`|  +------------------------------------------------------+  |`  
`|  |             Execution Environment                    |  |`  
`|  |  [Virtual Filesystem] <--> [Permissions Layer]        |  |`  
`|  |  <--> |  |`  
`|  +--------------------------+---------------------------+  |`  
`|                             |                              |`  
`|  +--------------------------v---------------------------+  |`  
`|  |             Context & State Management               |  |`  
`|  |  <-->    |  |`  
`|  |  <-->| |`  
`|  +--------------------------+---------------------------+  |`  
`|                             |                              |`  
`|  +--------------------------v---------------------------+  |`  
`|  |             Delegation & Human Steering              |  |`  
`|  |  <-->      |  |`  
`|  |  [Human-in-the-Loop Interrupt Approval Queues]       |  |`  
`|  +------------------------------------------------------+  |`  
`+------------------------------------------------------------+`

As developers began constructing systems for complex tasks like autonomous coding or deep research, they discovered that managing stateful graphs manually introduces significant infrastructure overhead. Engineers found themselves repeatedly building custom file systems, planning systems, subagent delegation mechanics, and conversation compaction routines.  
This realization brought about the third phase: the emergence of the agent harness. The agent harness, typified by the Deep Agents SDK, packages these operational components around the core model-calling loop, shifting the developer's role from building orchestrators to defining behavioral conventions and domain capabilities.

## **The Foundation Layer: LangChain and the Limits of Declarative Chains**

At the inception of the agentic software movement, the principal engineering challenge was the lack of standard abstractions to connect large language models with external data sources and tools. LangChain addressed this by providing a unified model interface and introducing the LangChain Expression Language (LCEL), a declarative syntax designed to easily compose components into chains.

### **LCEL Syntax and the Runnable Protocol**

The LangChain Expression Language is built entirely on the Runnable protocol, a standard interface that wraps components like chat models, prompt templates, output parsers, and retrievers. LCEL overrides the Python bitwise OR operator | to act as a Unix-style pipe, allowing developers to cleanly chain components.  
The pipe operator instructs the runtime to feed the output of the left-hand component as the input to the right-hand component. This declarative structure is lazily evaluated; the execution pipeline is not constructed or executed until a trigger method is explicitly called on the compiled chain.  
To support production demands, the Runnable protocol exposes several standard execution APIs, accommodating both synchronous and asynchronous operations :

* invoke / ainvoke: Process a single input through the chain, returning the final output synchronously or asynchronously.  
* stream / astream: Yield intermediate output chunks in real time as they are generated by the underlying model.  
* batch / abatch: Accept a list of inputs and execute them across parallel threads, optimizing latency when making multiple concurrent network calls.  
* astream\_log: Stream the final response while simultaneously emitting a log of all intermediate steps and state changes as they occur.

Data manipulation and branching within these pipelines are managed through specialized runnables, including RunnableParallel for concurrent operations, RunnablePassthrough to forward inputs unmodified, and RunnableLambda to wrap custom Python functions in the unified execution pipeline.

### **Limitations of Linear Pipelines**

While LCEL is highly effective for building deterministic workflows, it is inherently limited by its acyclic, sequential architecture. Linear pipelines are structured as directed acyclic graphs (DAGs), meaning execution flows strictly in one direction from input to output. This structure cannot naturally support cyclic execution, which is the foundational design pattern of autonomous agents.  
An autonomous agent must be able to call a tool, inspect its output, and dynamically decide whether to transition to a new tool, self-correct an error, loop back to refine its approach, or terminate the process. Forcing cyclic execution or dynamic branching into a linear chain requires writing verbose imperative boilerplate, which defeats the purpose of a declarative framework and increases the risk of type mismatches.  
Furthermore, linear chains lack built-in persistence, which means that any interruption or execution failure requires restarting the entire workflow from the beginning.

### **The LangChain 1.0 Architectural Reorganization**

Recognizing these limits, LangChain reorganized its architecture in version 1.0. All legacy chains and built-in agents were deprecated and replaced with a single high-level agent abstraction compiled natively on top of LangGraph.  
To preserve backwards compatibility for organizations unable to migrate, legacy code was partitioned into the langchain-classic package, establishing LangGraph as the core orchestration engine of the ecosystem.

## **The Orchestration Layer: LangGraph and Stateful Runtimes**

To support complex, cyclic agent behaviors, the orchestration layer shifted from linear pipelines to state machines. LangGraph was designed to address this need, providing a low-level runtime that models applications as directed, stateful cyclic graphs. Inspired by classic parallel computation frameworks like Pregel and Apache Beam, LangGraph models agents as distributed, stateful, multi-actor systems.

### **Primitives of the Stateful Graph**

A LangGraph application is constructed using a builder class called StateGraph, which is instantiated with a defined state schema and compiled into a runnable object. This state machine relies on three core primitives :

* **Nodes**: Computational units represented by plain Python functions, LangChain Runnables, or nested compiled subgraphs. A node receives the current state of the graph as its input and returns a dictionary representing a partial update to that state.  
* **Edges**: Transitions that govern how execution moves between nodes. Unconditional edges link nodes in a fixed sequence, while conditional edges execute a routing function to dynamically determine the next node based on the current state.  
* **State**: The centralized source of truth for the entire graph. It is represented by a typed schema, typically a Python TypedDict or a Pydantic model, which is updated as execution moves through nodes.

### **State Merging and Reducer Functions**

A key feature of LangGraph's state management is the use of state reducer functions. When a node returns a partial update to the state, the graph compiler determines how to merge this update into the global state based on reducers defined in the schema.  
By default, fields use a "last write wins" policy, where new values overwrite the old ones. However, fields can also declare custom reducer functions. For example, list-based fields (such as conversation histories) commonly use a concatenation reducer to seamlessly append new messages:  
`from typing import Annotated, TypedDict`  
`from langchain_core.m[span_60](start_span)[span_60](end_span)[span_67](start_span)[span_67](end_span)essages import BaseMessage`

`def append_messages(left: list, right: list) -> list:`  
    `return left + right`

`class AgentState(TypedDict):`  
    `# The annotating reducer ensures all partial updates append to the historical message log`  
    `messages: Annotated, append_messages]`  
    `current_task: str`

### **Durable Execution, Checkpointers, and Human Approval Interrupts**

To ensure reliability in production, LangGraph includes a native persistence layer backed by state checkpointers. After a node finishes executing, the checkpointer serializes and writes the state update to a database. If a system failure or network timeout occurs during a long-running execution, the graph can resume from its last verified checkpoint, avoiding the need to re-run expensive LLM calls.  
 `Node Execution Begins`  
          `|`  
   `[span_150](start_span)[span_150](end_span)[span_152](start_span)[span_152](end_span)       v`  
 `---> Execute Node Logic (LLM / Tool call)`  
 `[span_41](start_span)[span_41](end_span)[span_48](start_span)[span_48](end_span)                                               |`  
                                                `v`  
 `<--- Generate State Update Dict`  
          `|`  
          `v`  
 `Evaluate Next Edge (Unconditional or Conditional Routing)`

For testing, developers can use InMemorySaver from the langgraph-checkpoint library, while single-process applications can use langgraph-checkpoint-sqlite. Enterprise deployments typically use langgraph-checkpoint-postgres for scalable, persistent state management.  
This checkpointer architecture also supports human-in-the-loop validation patterns. By calling an interrupt primitive inside a node, graph execution is paused, and its state is written to the checkpointer.  
The graph then blocks further execution until an external client provides a resume payload. This is processed using the Command primitive, resuming the graph's execution from the exact point where it was interrupted :  
This design allows developers to implement safety gates for sensitive actions like writing to databases, running code, or calling external APIs. Additionally, LangGraph supports dynamic parallel fan-out via the Send primitive, which allows a node to spawn multiple target nodes in parallel using distinct state payloads.

## **The Deep Agents Harness: Architectural Blueprint and Execution Environment**

While stateful runtimes like LangGraph provide the low-level mechanics needed to build cyclic workflows, engineers still had to design and implement their own high-level agent scaffolding. The Deep Agents SDK solves this by providing a pre-configured, opinionated agent harness.  
Calling the create\_deep\_agent factory function compiles an optimized LangGraph state machine, automatically wrapping the model in a middleware stack that handles task planning, file access, and subagent delegation.  
`# Programmatic instantiation of a fully configured Deep Agent`  
`from deepagents import create_deep_agent`  
`from deepagents.backends import FilesystemBackend`  
`from langchain_anthropic import ChatAnthropic`

`model = ChatAnthropic(model="claude-3-5-sonnet-20240620", temperature=0)`

`agent = create_deep_agent(`  
    `model=model,`  
    `system_prompt="You are an automated code audit and repair agent.",`  
    `tools=[run_security_scanner],`  
    `backend=FilesystemBackend(root_dir="./project_workspace"),`  
    `permissions=[`  
        `{"operations": ["read"], "paths": ["src/**/*.py"], "mode": "allow"},`  
        `{"operations": ["write"], "paths": ["src/**/*.py"], "mode": "allow"},`  
        `{"operations": ["read", "write"], "paths": ["**/.env", "**/secrets/*"], "mode": "deny"}`  
    `],`  
    `interrupt_on={"run_security_scanner": True}`  
`)`

The Deep Agents SDK organizes agentic operations into four main capabilities: execution environment, context management, delegation, and steering.

### **Pluggable Virtual Filesystem and Multimodal Operations**

The virtual filesystem is a core capability of the Deep Agents harness, acting as a shared workspace where the main agent and any spawned subagents can read, write, and modify files. The virtual filesystem exposes a set of standard tools to the model, including ls, read\_file, write\_file, edit\_file (which uses precise string replacements), glob, and grep.  
When the model uses the read\_file tool on binary or formatted assets, the virtual filesystem automatically parses the data and returns standard multimodal content blocks to the model. This allows the agent to ingest images, video, audio, PDFs, and slide decks natively:

| Asset Category | Supported File Extensions | Under-the-Hood Ingestion Behavior |
| :---- | :---- | :---- |
| **Images** | .png, .jpg, .jpeg, .gif, .webp, .heic, .heif | Converts raw bytes to base64 inline image blocks for direct visual analysis. |
| *Videos* | .mp4, .mpeg, .mov, .avi, .flv, .webm, .wmv, .3gpp | Samples frames or transcodes video components into sequentially indexed multimodal blocks. |
| **Audio** | .wav, .mp3, .aiff, .aac, .ogg, .flac | Extracts acoustic content and formats it for audio-capable model models. |
| **Documents** | .pdf, .ppt, .pptx | Extracts text layouts, page structures, and embedded visual assets as combined multimodal data. |

These filesystem tools can connect to different storage backends using the pluggable backend architecture :

* StateBackend: Stores file data directly in the active LangGraph thread state. The workspace is kept entirely in memory and is automatically cleared when the session terminates, making it ideal for isolated, short-lived tasks.  
* FilesystemBackend: Mounts directly to a specific directory on the host's physical disk, allowing the agent to read and write local source code and files.  
* StoreBackend: Connects directly to LangGraph's persistent Store, allowing the agent to persist long-term memories and search them across different threads and sessions.  
* Co\[span\_206\](start\_span)\[span\_206\](end\_span)\[span\_208\](start\_span)\[span\_208\](end\_span)mpositeBackend: Acts as an internal router, mapping specific directory paths to different backends based on route prefixes. This allows temporary work to be routed to StateBackend while persistent files are sent to StoreBackend.

### **Declarative Filesystem Permissions**

To enforce security boundaries, the harness supports declarative permission rules passed to the permissions parameter of create\_deep\_agent. Each rule is defined as an object containing specified operations ("read", "write"), directory path patterns (globs), and the action mode ("allow", "deny").  
Rules are evaluated sequentially in the order they are declared, using first-match-wins semantics :  
This structure ensures that file operations are validated before any data is read or written. It operates on a robust "trust the LLM" security model, where security boundaries are enforced at the tool level rather than relying on prompt guidelines.

### **Code Execution: Sandboxes vs. Interpreters**

The harness supports code execution through two distinct environments:

* **Sandbox Backends**: Exposes an execute tool that runs shell commands inside an isolated environment (such as Modal or Daytona) implementing the SandboxBackendProtocolV2 interface. This environment allows the agent to install dependencies, run tests, run compilers, and interact with the operating system filesystem.  
* **Scoped Interpreters**: Exposes an eval tool that executes JavaScript inside an in-process, scoped QuickJS runtime. This interpreter has no filesystem, shell, or network access, and is designed purely to let the model run loops, perform data transformations, and orchestrate subagents without needing a full shell sandbox.

## **Technical Mechanics of Context Compaction, Summarization, and Memory**

The main challenge when running agents over long execution horizons is managing the model's context window. As an agent runs multi-step tasks, its conversation history grows, which can lead to attention loss, increased latency, higher costs, and context overflow errors.  
To address this, the Deep Agents SDK implements an automated, multi-tier context compression and memory pipeline.  
                              
                                         `|`  
                                         `v`  
                      `Check Token Budget Against Model Profile`  
                                         `|`  
         `+-------------------------------+-------------------------------+`  
         `|                                                               |`  
         `v                                                               v`  
                                  
         `|                                                               |`  
         `|                                                               v`  
         `|                                             Is Tool Output > 20,000 Tokens?`  
         `|                                                               |`  
         `|                                       +-----------------------+-----------------------+`  
         `|                                       | Yes                                           | No`  
         `|                                       v                                               v`  
         `|                         Offload Output to Filesystem;                     Truncate Older Arguments`  
         `|                         Replace with Path & Preview                       (write_file/edit_file)`  
         `|                                       |                                               |`  
         `|                                       +-----------------------+-----------------------+`  
         `|                                                               |`  
         `|                                                               v`  
         `|                                               Is Token Count Still Over Budget?`  
         `|                                                               |`  
         `|                                       +-----------------------+-----------------------+`  
         `|                                       | Yes                                           | No`  
         `|                                       v                                               v`  
         `|                         Generate Structured In-Context Summary;                       |`  
         `|                         Evict Messages to /conversation_history/                     |`  
         `|                                       |                                               |`  
         `v                                       +-----------------------+-----------------------+`  
 `[Forward to Model] <----------------------------------------------------+`

The compression pipeline evaluates and compacts conversation histories using four automated tiers:

### **1\. Automated Offloading of Large Tool Outputs**

When an agent runs a tool that returns a massive payload (such as reading a dense document or hitting an external search API), the payload can easily exhaust the context window.

* **Threshold Trigger**: The harness monitors the size of all incoming tool responses. If a response exceeds **20,000 tokens**, the offloading engine is triggered.  
* **Offloading Mechanics**: The raw tool response is intercepted by the filesystem middleware and saved as a file on the configured backend.  
* **Active State Modification**: The raw response payload in the active message history is replaced with a structural metadata dictionary containing a reference path (e.g., "/temp/tool\_result\_1.txt") and a preview of the first 10 lines of the output. The agent can use this preview to verify the output, and call read\_file or grep on the path if it needs to retrieve the full content later.

### **2\. Pre-Summarization Tool-Argument Truncation**

Even when tool outputs are compact, the input arguments for file mutations (such as writing or editing code) remain in the message history as redundant duplicates of content that already exists on the filesystem.

* **Threshold Trigger**: When the total active conversation size crosses **85%** of the model's maximum input token limit (resolved dynamically using model profiles), argument truncation is initiated.  
* **Trimming Process**: The middleware parses previous messages in the chat history, targeting AIMessage.tool\_calls arguments for files written or modified in prior steps (such as write\_file or edit\_file calls).  
* **Context Truncation**: The verbose arguments are stripped and replaced with pointers to the files on disk, instantly freeing up token budget while preserving the logical flow of the conversation.

### **3\. Active Conversational Summarization**

If tool input and output offloading does not free up enough context, the system falls back to active summarization.

* **Summary Generation**: An LLM processes the older message history to generate a structured summary. This summary captures the current session intent, a list of created artifacts, and the planned next steps.  
* **Conversation History Offloading**: The full raw history of the evicted messages is formatted as Markdown and appended to /conversation\_history/{thread\_id}.md on the configured backend.  
* **Message Compaction**: The raw messages are evicted from the active graph state and replaced with the structured summary. Because the summary includes the path to the Markdown file on disk, the agent can use the filesystem tools to re-open and review the raw history if needed.  
* **State Preservation**: To keep the state non-mutating, the summarization event is recorded in a private \_summarization\_event field in the graph state rather than destructively rewriting the conversation log. This ensures developers can still run full replays, evaluations, and manual debugging using the original raw message history.

### **4\. ContextOverflowError Fallback Recovery**

In addition to proactive compression, the harness serves as a safety net against provider-level rejection errors. If a model provider unexpectedly rejects a request with an over-budget error (such as a ContextOverflowError), the middleware catches the exception, immediately triggers conversational summarization, and retries the call. This prevents API-level over-budget errors from crashing long-running agent executions.

## **Evaluation and Context Compaction Benchmarking**

Designing context compression algorithms requires rigorous evaluation metrics to ensure that compaction does not cause the model to lose track of its goals or drop critical details. The Deep Agents SDK includes a set of targeted evaluations designed to isolate and validate these context management systems.  
`+-----------------------------------------------------------------------------+`  
`|               CONTEXT COMPACTION EVALUATION PIPELINE                        |`  
`+-----------------------------------------------------------------------------+`  
`| 1.        Run the harness on representative real-world tasks  |`  
`|           [span_102](start_span)[span_102](end_span)               to establish baseline performance metrics.         |`  
`|                                                         [span_103](start_span)[span_103](end_span)                    |`  
`| 2.         Force aggressive compression by setting thresholds  |`  
`|                          to 10-20% of context window size (vs 85% default). |`  
`|                                                                             |`  
`| 3. Insert key details into data before compaction;    |`  
`|                          verify the agent retrieves them using "needle-in-  |`  
`|                          a-haystack" testing.                               |`  
`|                                                                             |`  
`| 4.  Track agent execution to detect if compaction      |`  
`|                          causes the agent to deviate from goals or complete |`  
`|                          prematurely.                                       |`  
`+-----------------------------------------------------------------------------+`

When evaluating context compression strategies, best practices focus on three core areas:

* **Stress-Testing via Early Compaction**: Evaluating context management on large datasets can be slow and expensive because compression events only trigger after the context window is nearly full. To run evaluations more efficiently, developers can configure the harness to trigger compression much earlier (e.g., at **10-20%** of the context window instead of 85%). This artificially increases the frequency of compression events, making it easier to compare different approaches (such as prompt variations or different summarization models).  
* **Recoverability and Detail Retention**: Context compression is only useful if the agent can still retrieve specific, fine-grained details when needed. Developers should implement "needle-in-a-haystack" tests, placing a specific piece of information in the early conversation history, running a compaction event, and then verifying whether the agent can successfully locate and retrieve that detail from the offloaded files.  
* **Goal Drift Monitoring**: One of the most common issues with conversational summarization is goal drift, where the agent loses track of the user's original objective after a summary is generated. This issue typically manifests in two ways: the agent may prematurely declare a task complete, or it may loop back and ask the user for clarification on information it already received. Artificially forcing frequent summarization runs during testing helps developers detect and fix these deviations before deploying the agent to production.

## **Task Delegation, Progressive Skills, and the Subagent Lifecycle**

The Deep Agents SDK is designed to help agents handle complex, multi-step tasks by breaking them down into smaller, parallelizable subtasks. The harness manages this delegation through two built-in systems: structured task planning and ephemeral subagent spawning.

### **Structured Task Planning**

The harness injects a built-in write\_todos planning tool directly into the agent's environment. When given a complex task, the agent uses this tool to break the objective down into distinct steps and track their statuses (pending, in\_progress, or completed).  
Unlike simple prompt instructions, this to-do list is stored as a persistent variable within the agent's graph state. This allows the agent to review, update, and adapt its plan as execution progresses, keeping it on track over long running sessions.

### **Ephemeral Subagent Lifecycles**

When the parent agent identifies a complex, self-contained subtask, it calls the built-in task tool to spawn an ephemeral subagent.  
                     `Parent Agent calls task()`  
                                `|`  
                                `v`  
               `Isolate Subagent State & Context`  
                                `|`  
               `Apply Default Middleware Stack`  
                                `|`  
               `Run Subagent Graph to Completion`  
                                `|`  
               `Serialize Final State Messages`  
                                `|`  
                                `v`  
                `Return Conciliated JSON Report`

This delegation mechanism follows a strict operational lifecycle:

1. **Spawn**: The parent agent calls the task tool, passing a defined SubAgent configuration. This config specifies the subagent's role, instructions, tools, and expected output format.  
2. **Isolate**: The harness creates a new, isolated state context for the subagent. To protect sensitive files, the subagent can be configured with its own restrictive filesystem permissions, overriding the parent's default rules.  
3. **Run**: The subagent executes its task autonomously. It is completely stateless, meaning it runs to completion and cannot send intermediate messages back to the parent.  
4. **Return**: Once the subagent finishes, the harness reads its final state. The subagent's state schema must include a "messages" key to communicate results back to the parent. If a structured response is defined, the output is JSON-serialized and returned; otherwise, the last text message from the subagent is used.  
5. **Reconcile**: The parent agent receives the subagent's final report as a clean, concise tool response, keeping the parent's active context window free of the subagent's detailed execution steps.

The programmatic configuration of a subagent is defined using the SubAgent TypedDict schema:

| Parameter Field | Expected Type | Description and Structural Role |
| :---- | :---- | :---- |
| **name** | str | Unique identifier used by the parent agent to target this specific subagent via the task tool. |
| **description** | str | A semantic description of the subagent's capabilities, used by the parent to determine when to delegate. |
| **system\_prompt** | str | The behavioral instructions and formatting requirements for the subagent. |
| **tools** | NotRequired\] | The tools available to the subagent; if omitted, it inherits the parent's default tools. |
| **model** | NotRequired\[str | Chat\[span\_272\](start\_span)\[span\_272\](end\_span)Model\] | Model override (e.g., 'openai:gpt-5.5') to run the subagent on a cheaper or more specialized model. |
| **middleware** | NotRequired\[list\[M\[span\_273\](start\_span)\[span\_273\](end\_span)iddleware\]\] | Additional middleware to apply custom behavior, logging, or rate-limiting to the subagent. |
| **interrupt\_on** | NotRequired\[dict\[span\_274\](start\_span)\[span\_274\](end\_span)\[str, bool\]\] | Configures human-in-the-loop approval gates for specific tools within the subagent. |
| **skills** | NotRequired\[list\[str\]\]\[span\_275\](start\_span)\[span\_275\](end\_span) | Custom skill source directories to load into the subagent's progressive disclosure catalog. |
| **permissions** | NotRequired\] | Filesystem permissions for the subagent, replacing the parent's rules entirely. |
| **response\_format** | NotRequired | Defines the structured JSON output format for the subagent's final report. |

### **Progressive Disclosure of Skills**

To prevent system prompts from becoming cluttered and consuming unnecessary tokens, the Deep Agents harness supports on-demand skill loading.  
The developer defines specialized workflows in directories containing a standard SKILL.md file. When the agent is initialized, the SkillsMiddleware scans these directories and parses the YAML frontmatter from each SKILL.md file :  
`---`  
`name: database_migration`  
`description: "Executes schema[span_195](start_span)[span_195](end_span) migrations and database rollbacks. Do NOT use for raw read queries."`  
`---`

At startup, the harness only loads the skill names and descriptions into the agent's prompt catalog, which typically consumes only a few hundred tokens.  
The agent reads this catalog and dynamically decides which skills are relevant to the user's request. The full body and instructions of a skill are only loaded into the active system prompt when the agent explicitly chooses to invoke it, keeping the primary prompt clean.

## **Graph Assembly, System Prompt Assembly, and Managed Deployments**

When a developer calls create\_deep\_agent, the harness compiles the agent definition into a fully structured LangGraph. Under the hood, the harness wraps the model in a middleware stack that intercepts requests, registers default tools, and dynamically assembles the system prompt.

### **System Prompt Assembly Order**

The final system prompt sent to the model is assembled in a specific order using up to four named parts, ensuring that custom instructions and model-specific profiles merge cleanly :

| Assembly Step | Segment Name | Source and Execution Behavior |
| :---- | :---- | :---- |
| **Step 1** | BASE / CUSTOM | Resolves to the default BASE\_AGENT\_PROMPT constant. If a matching HarnessProfile overrides this, the CUSTOM system prompt is used instead. |
| **Step 2** | USER | The custom system\_prompt string or SystemMessage passed directly to the create\_deep\_agent factory function. |
| **Step 3** | MIDDLEWARE | Dynamic system instructions injected by registered middleware layers, such as active task plans, loaded skills, and subagent guidelines. |
| **Step 4** | SUFFIX | Model-specific adjustments (such as formatting tweaks) appended from the matching HarnessProfile. |

If the USER prompt is passed as a structured SystemMessage instead of a plain string, the dynamically assembled segments are appended as text content blocks directly to the message. This design ensures that any pre-configured cache control markers set by the developer are preserved.

### **Decoupling Configuration via Harness Profiles**

The Deep Agents SDK is model-agnostic, supporting commercial APIs and local open-weights deployments. To help developers manage different models without changing their core code, the harness decouples model configuration into two types of profiles :

* ProviderProfile: Controls options during the model-construction phase, such as setting custom initialization arguments or handling provider-specific API keys.  
* HarnessProfile / HarnessProfileConfig: Manages runtime configurations after the model is built, including system prompt suffixes, default tools, and custom middleware adjustments.

These profiles are registered using the register\_harness\_profile function. When a model is resolved, the harness automatically applies the matching profile based on the provider name (e.g., "openai") or model key (e.g., "openai:gpt-5.4"), making it easy to swap models without changing the primary application code.

### **Enterprise Managed Runtimes in LangSmith**

For production deployments, Managed Deep Agents provides a hosted, API-first runtime integrated directly into the LangSmith platform. This managed service acts as a durable host for deep agents, handling infrastructure requirements like thread execution, checkpoints, streaming, sandboxes, and observability.  
Developers can configure and run these managed agents programmatically by sending JSON payloads to the LangSmith API :  
`{`  
  `"instructions": "You are a production release validator.",`  
  `"tools": [`  
    `{`  
      `"name": "tavily_search",`  
      `"mcp_server_url": "https://mcp.tavily.com/mcp/",`  
      `"mcp_server_name": "tavily",`  
      `"display_name": "tavily_search"`  
    `}`  
  `],`  
  `"interrupt_config": {`  
    `"https://mcp.tavily.com/mcp/::tavily_search::tavily": false`  
  `}`  
`}`

The managed runtime natively supports the Model Context Protocol (MCP), allowing agents to securely consume tools provided by external MCP servers using static header authentication.  
When deploying deep agents in production, developers must plan for explicit thread cleanup. Deleting a managed agent in LangSmith does not automatically delete its associated execution threads.  
These orphaned threads remain queryable in the system. However, attempting to start a new run on an orphaned thread will return a 502 Bad Gateway error. Consequently, enterprise applications must explicitly track and delete active threads to ensure proper resource cleanup and avoid orphaned state errors.  
For real-time user interfaces, the managed API exposes three distinct Server-Sent Event (SSE) streaming modes :

| Streaming Mode | SSE Event Type | Payload Structure and Operational Behavior |
| :---- | :---- | :---- |
| **values** | event: values | Emits the complete, updated state of the graph after every step. This is ideal for applications that need to keep a client-side state synchronized with the agent's active execution state. |
| **updates** | event: updates | Emits only the state changes produced by the specific node or middleware that executed. Nodes that execute without updating the state return null payloads, reducing network bandwidth. |
| **messages-tuple** | event: messages | Emits real-time tokens as a \[chunk, metadata\] tuple. The chunk contains partial message data, while the metadata describes the executing node and model provider. This is optimized for streaming typing indicators and text completions in chat interfaces. |

## **Architectural Conclusions**

The evolution of large language model software architectures from simple declarative chains to stateful graphs and unified agent harnesses highlights a clear trend toward higher autonomy and self-managing runtimes. This evolution has produced several key architectural conclusions:  
First, systems designed for complex, long-running tasks must decouple state tracking from prompt guidelines. Relying on the model to self-police or manage its own memory window in prose is unreliable and inefficient.  
Using structures like LangGraph's state machine and the Deep Agents virtual filesystem allows the system to enforce strict, deterministic security boundaries while giving the model a stable environment to operate in.  
Second, managing context is critical to preventing attention degradation and keeping API costs manageable.  
The Deep Agents SDK's multi-tier compression pipeline—which combines automated filesystem offloading, tool-argument truncation, and conversational summarization—shows that effective context management requires both saving raw history to disk and presenting a clean, synthesized summary to the active model.  
Finally, as agents take on increasingly complex, multi-step tasks, the orchestration layer must support task delegation and modular specialization.  
By using progressive skill disclosure and spawning ephemeral, isolated subagents, developers can build highly complex, parallelizable systems that keep the primary context window clean and focused. This architectural progression ensures that model-driven software can scale from simple prototypes to resilient, production-grade applications.

#### **Works cited**

1\. Frameworks, runtimes, and harnesses \- Docs by LangChain, https://docs.langchain.com/oss/python/concepts/products 2\. Deep Agents: LangChain's SDK for Agents That Plan and Delegate | Talk Python To Me Podcast, https://talkpython.fm/episodes/show/543/deep-agents-langchains-sdk-for-agents-that-plan-and-delegate 3\. Deep Agents \- LangChain, https://www.langchain.com/blog/deep-agents 4\. Context Management for Deep Agents \- LangChain, https://www.langchain.com/blog/context-management-for-deepagents 5\. LangChain Just Released Deep Agents — And It Changes How You Build AI Systems, https://pub.towardsai.net/langchain-just-released-deep-agents-and-it-changes-how-you-build-ai-systems-cc2371b04714 6\. Philosophy \- Docs by LangChain, https://docs.langchain.com/oss/python/langchain/philosophy 7\. LangGraph: Stateful multi-agent systems \- DataNorth AI, https://datanorth.ai/blog/langgraph-stateful-multi-agent-systems 8\. LangGraph: A Framework for Building Stateful Multi-Agent LLM Applications | by Ken Lin, https://medium.com/@ken\_lin/langgraph-a-framework-for-building-stateful-multi-agent-llm-applications-a51d5eb68d03 9\. Managed Deep Agents: the fastest way to ship a production deep agent \- LangChain, https://www.langchain.com/blog/introducing-managed-deep-agents 10\. A Beginner's Guide to LangChain Expression Language (LCEL): Building Powerful Chains | by Mustafa Akça | Medium, https://medium.com/@mustafa\_akca/a-beginners-guide-to-langchain-expression-language-lcel-building-powerful-chains-b1711529efd2 11\. Unleashing the Power of LangChain Expression Language (LCEL): from proof of concept to production \- Artefact, https://www.artefact.com/blog/unleashing-the-power-of-langchain-expression-language-lcel-from-proof-of-concept-to-production/ 12\. LCEL Interface | LangChain OpenTutorial \- GitBook, https://langchain-opentutorial.gitbook.io/langchain-opentutorial/01-basic/07-lcel-interface 13\. Overview of LangChain Expression Language (LCEL) | K21Academy, https://k21academy.com/ai-ml/langchain-expression-language/ 14\. What is LangGraph? Stateful Agent Graphs Explained in 2026 \- Future AGI, https://futureagi.com/blog/what-is-langgraph-2026/ 15\. LangGraph overview \- Docs by LangChain, https://docs.langchain.com/oss/python/langgraph/overview 16\. langgraph | Skills Marketplace \- LobeHub, https://lobehub.com/skills/agent-skills-hub-agent-skills-hub-langgraph 17\. langchain-ai/deepagents: The batteries-included agent harness. \- GitHub, https://github.com/langchain-ai/deepagents 18\. Harness capabilities \- Docs by LangChain, https://docs.langchain.com/oss/python/deepagents/harness 19\. Deep Agents overview \- Docs by LangChain, https://docs.langchain.com/oss/python/deepagents/overview 20\. How to Build Production-Ready AI Agents with Deep Agents \- Milvus Blog, https://milvus.io/blog/how-to-build-productionready-ai-agents-with-deep-agents-and-milvus.md 21\. Building Deep Agents \+ SKILL.md with Langchain | by A B Vijay Kumar | Mar, 2026, https://abvijaykumar.medium.com/building-deep-agents-skill-md-with-langchain-074176c66dec 22\. summarization | deepagents | LangChain Reference, https://reference.langchain.com/python/deepagents/middleware/summarization 23\. deepagents \- LangChain Reference Docs, https://reference.langchain.com/python/deepagents 24\. graph | deepagents \- LangChain Reference Docs, https://reference.langchain.com/python/deepagents/graph 25\. LangChain Deep Agents: Build Agents for Complex, Multi-Step Tasks, https://www.langchain.com/deep-agents 26\. TASK\_SYSTEM\_PROMPT | deepagents \- LangChain Reference Docs, https://reference.langchain.com/python/deepagents/middleware/subagents/TASK\_SYSTEM\_PROMPT 27\. SubAgent | deepagents \- LangChain Reference Docs, https://reference.langchain.com/python/deepagents/middleware/subagents/SubAgent 28\. CompiledSubAgent | deepagents \- LangChain Reference Docs, https://reference.langchain.com/python/deepagents/middleware/subagents/CompiledSubAgent 29\. deepagents | LangChain Reference, https://reference.langchain.com/python/deepagents/deepagents 30\. Managed Deep Agents \- Docs by LangChain, https://docs.langchain.com/langsmith/deploy-managed-deep-agent