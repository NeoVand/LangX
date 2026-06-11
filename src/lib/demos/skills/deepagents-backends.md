---
name: deepagents-backends
description: Choose and compose deep-agent storage backends — StateBackend (thread-scoped, lives in checkpoints), StoreBackend (durable BaseStore, namespaced per user/assistant), FilesystemBackend (real disk, virtualMode jail), LocalShellBackend (+execute), ContextHubBackend (a version commit per write), sandbox backends (Modal/Daytona/Runloop/Deno/LangSmith), and CompositeBackend prefix routing (longest prefix wins, default route carries harness internals). The six filesystem tools are a contract; the backend is configuration. Worked example - the Observatory: one agent, two shelves — /atlas/** on a durable store survives new threads and page reloads, /scratch/** burns off with the thread; sessions are nights, and the star atlas accumulates because the storage does. Use whenever an agent must remember across sessions, forget between jobs, touch real disks, or execute code safely.
---

# Backends (where files live)

`ls / read_file / write_file / edit_file / glob / grep` never change. What stands behind them — `BackendProtocol(V2)` — is a constructor argument. Swap it and the same agent becomes ephemeral, durable, versioned, or sandboxed, with zero changes to its code or prompt.

## 1 · The shelf list

| Backend | Lifetime / superpower | Notes |
| --- | --- | --- |
| `StateBackend` | the thread's — files live in checkpoints | **default**; perfect isolation, total amnesia between threads |
| `StoreBackend` | durable, cross-thread (`BaseStore`) | namespace factory: per-user (`rt.serverInfo.user.identity`), per-assistant, per-thread |
| `FilesystemBackend` | a real directory | `virtualMode: true` jails `..`/`~`/absolute escapes |
| `LocalShellBackend` | filesystem + `execute()` | **no sandboxing** — gate with HITL |
| `ContextHubBackend` | durable + versioned | every write is a LangSmith Hub commit; full history per file |
| Sandboxes (Modal, Daytona, Runloop, Deno, LangSmith) | isolated disk + `execute()` | the safe way to let agents run code |
| your own | anything | implement `BackendProtocolV2`: `ls, read(offset/limit), readRaw, grep, glob, write, edit` — errors as values |

## 2 · CompositeBackend: lifetime as a routing decision

```ts
const backend = new CompositeBackend(
  [{ prefix: "/atlas/", backend: new StoreBackend("observatory-atlas") }],
  new StateBackend() // default route
);
```

- **Longest matching prefix wins** (`/memories/projects/` shadows `/memories/`); unmatched paths take the default route.
- `ls`/`glob`/`grep` aggregate across all routes — the agent sees ONE workspace.
- The default route also receives the harness's own internal files (offloaded tool outputs, archived history) — keep it ephemeral unless you want that persisted.
- The prompt never mentions storage tech. It states semantics: *"/atlas/ is the permanent record; /scratch/ burns off at dawn."* The router makes it true.

## 3 · Ephemeral is a feature, durable is a decision

- Thread-scoped state gives every job a clean bench: nothing leaks forward, runs replay from checkpoints. Don't fight it — use it for working notes, drafts, triage.
- Durable paths are for the NEXT agent — one that remembers nothing of this conversation. Write for a successor: ledgers, logbooks, profiles, indexes.
- The cross-session pattern (the Observatory): durable **structured ledger** (`/atlas/chart.json`) + durable **prose log** (`/atlas/logbook.md`, "## Night N" appended per session) + ephemeral scratch. Session N+1 starts by reading both.

## 4 · Protect structured durable files

A durable JSON ledger corrupted by one freehand `write_file` is corrupted for every future session. Two-layer defense:

```ts
permissions: [{ operations: ["write"], paths: ["/atlas/chart.json"], mode: "deny" }]
```

…and mutate it only through a deterministic tool (read → validate → modify → write inside the tool). The agent gets a polite error message, not a corrupted store. Prose files (logbooks) can stay freehand.

## 5 · Gotchas

- A "session" boundary is YOURS to define: new `thread_id` + fresh agent = new session; the store is what bridges them. Keep a session/day/night counter **inside the durable file**, not in page or process state.
- Browser demos: IndexedDB (Dexie) is the honest stand-in for a production store — it genuinely survives reloads. In Node, fall back to in-memory and say so.
- Tolerant parsing for durable JSON (`parseChart`-style): a corrupted file should degrade to a fresh default, never crash every future session.
- Don't put the durable mount at `/` — then nothing is ephemeral, including the harness's offload files, and threads stop being isolated.
- Official quirk: store-backed files are namespaced; two users never see each other's `/memories/` even with identical paths.
