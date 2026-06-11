---
name: deepagents-virtual-fs
description: Work the deep-agent virtual filesystem well — the six built-in tools (ls, read_file, write_file, edit_file, glob, grep), the find→read→edit→verify loop, files-as-memory (offloading, notes that survive compaction), paged reads with offset/limit, surgical edits with unique oldString, and tool-layer guardrails (permissions deny, e.g. read-only /test/**). Worked example - the Bug Hunt: an agent fixes a ticket in a 15-file codebase it has never seen by reproducing with the project's own test suite, locating the fault with glob + grep, writing a diagnosis to /notes before fixing, and making the smallest possible edit_file until the suite is green. Use whenever an agent must navigate, search, or modify a workspace bigger than its context window.
---

# The virtual filesystem (deep agents)

The context window is RAM — re-billed every call, compacted when full. The filesystem is disk — written once, searchable forever, untouched by summarization. Deep agents are built around this asymmetry: the harness offloads anything big to files, and a good agent offloads its own thinking there too.

## 1 · The six tools

```ts
ls()                                    // every path in the workspace
glob("src/**/*.js")                     // find files by NAME
grep("couponDiscount")                  // find files by CONTENT → path:line: hits
read_file(path, offset?, limit?)        // read a WINDOW, never the whole file
write_file(path, content)               // new files (official semantics: create-only)
edit_file(path, oldString, newString, replaceAll?)  // surgical; oldString must be UNIQUE
```

- **Two find, two read, two write.** `glob`/`grep` exist so the agent never reads a file just to learn it was the wrong file.
- `read_file` pages: a 2,000-line log is read in `offset`/`limit` windows, guided by `grep` line numbers.
- `edit_file` refuses a non-unique `oldString` (pass more surrounding context, or `replaceAll: true`). A failed match is an error the model can read and correct — the file is never silently corrupted.
- Official deltas worth knowing: `write_file` is **create-only** (edits must go through `edit_file`); `read_file` is **multimodal** (images/PDF/audio return typed content blocks with a `mimeType`); `grep` accepts `path`/`glob` filters. All six speak **BackendProtocolV2** (`ls, read, readRaw, grep, glob, write, edit` — errors as values), so the same tools run against graph state, disk, stores, or sandboxes.

## 2 · Files as memory (what the harness does for you)

- Tool outputs **> ~20k tokens never enter context**: offloaded to a file; the model sees the path + a 10-line preview, and `read_file`s the rest on demand.
- Summarization fires at **~85% of the model's input budget**, keeps ~10% most-recent tokens — and the structured summary preserves **file paths**, so offloaded content stays one tool call away.
- Therefore: anything worth keeping goes in a file. Plans, findings, diagnoses — `/notes/*.md` is the agent's lab notebook, immune to compaction.

## 3 · The work loop (the Bug Hunt pattern)

```text
1 REPRODUCE   run the failing thing first — failures are ground truth, not ticket prose
2 LOCATE      glob to map → grep identifiers from the ticket/failures → follow evidence
3 READ        only what the evidence points at (offset/limit on long files)
4 DIAGNOSE    write /notes/diagnosis.md BEFORE fixing — survives compaction, guides retries
5 FIX         the smallest edit_file that kills the root cause; no refactors
6 VERIFY      run the check again; green or back to 2
```

Prompt lines that make it stick: "Read ONLY the files the evidence points to — never the whole repo", "the SMALLEST edit_file that corrects the root cause", "Trust the code over its comments."

## 4 · A real verify tool

Pair the filesystem with a checker that actually executes the work. The Bug Hunt runs the seeded project's own tests from the workspace, inside a sandboxed Worker with a timeout:

```ts
const runTests = tool(async () => {
  const files = Object.fromEntries((await backend.list()).map((f) => [f.path, f.content]));
  return formatReport(await runSuiteInWorker(files)); // ✓/✗ per test, expected vs actual
}, { name: "run_tests", description: "Run /test/*.test.js from the workspace…", schema: z.object({}) });
```

Failures must carry **expected vs actual** — that detail is what lets the model find the right line with one grep.

## 5 · Guardrails at the tool layer

The agent must not "fix" a bug by editing the spec. Don't ask nicely — deny:

```ts
permissions: [{ operations: ["write"], paths: ["/test/**"], mode: "deny" }]
```

First match wins; unmatched operations are allowed. The docs' security model: *"trust the LLM"* — boundaries live in tools and sandboxes, not in prompt promises. (Official permissions also support an `interrupt` mode that routes a matched write to a human for approval.)

## 6 · Gotchas

- Seed workspaces by writing to the backend **before** the run; the agent's first `ls` should show the world, not build it.
- grep output format `path:line: text` is load-bearing — models use the line numbers to aim `read_file(offset)` and the paths to aim `edit_file`.
- Don't let an agent rewrite whole files to make one change: token-expensive and risky. If a file is beyond surgical repair after two failed fixes, rewrite it *simpler* — and say so in the prompt.
- A verify tool that can hang (agent-introduced infinite loop) needs a hard timeout and a sandbox (Worker/iframe/subprocess), or one bad edit freezes the host.
- Comments describe intent, not behavior. Tests are the spec; protect them.
