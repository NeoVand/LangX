---
name: langchain-agentic-rag
description: Build a document-grounded Q&A agent in LangChain v1 (TypeScript) using only createAgent — a retriever exposed as a tool, inline citations, multi-turn memory via a checkpointer, and middleware. The agent decides when to search, rewrites weak queries and searches again, asks for clarification when unsure, and cites every claim. Use this to ship a RAG chatbot over your own documents without hand-coding a retrieve→stuff→generate pipeline or reaching for raw LangGraph.
---

# Agentic RAG with createAgent

Naive RAG is a fixed pipeline: embed the question, retrieve the nearest chunks, stuff them into the prompt, generate. It can't recover from a bad query or an ambiguous question. **Agentic RAG** gives the model a *search tool* and lets the `createAgent` loop drive: search → judge the results → reword and search again → answer with citations, or ask the user to clarify.

## When to use this

- A chatbot over your own documents that must **cite its sources** and not hallucinate.
- Questions that need **multiple or reworded searches** (compound questions, weak first results).
- A **multi-turn** assistant where follow-ups depend on earlier turns.

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/langgraph @langchain/core zod @langchain/anthropic @langchain/openai`
- Keys: `ANTHROPIC_API_KEY` (the agent model) and an embeddings key (here `OPENAI_API_KEY`). Swap providers freely.

## 1. Index your documents

Chunk → embed → store. Any LangChain `VectorStore` works (here, an in-memory one).

```ts
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const store = new MemoryVectorStore(new OpenAIEmbeddings({ model: 'text-embedding-3-small' }));

async function indexDocs(docs: { source: string; text: string }[]) {
  for (const d of docs) {
    const parts = await splitter.splitText(d.text);
    await store.addDocuments(
      parts.map((text, index) => new Document({ pageContent: text, metadata: { source: d.source, index } }))
    );
  }
}
```

## 2. Expose retrieval as a tool (with citation ids)

The key move: the agent *chooses* to search. Return each passage with a short id so the model can cite it.

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const searchDocuments = tool(
  async ({ query, k }) => {
    const hits = await store.similaritySearchWithScore(query, k ?? 4);
    return JSON.stringify(
      hits.map(([doc, score], i) => ({
        id: `S${i + 1}`,                       // citation id the model references
        source: doc.metadata.source,
        score: Number(score.toFixed(3)),
        snippet: doc.pageContent
      }))
    );
  },
  {
    name: 'search_documents',
    description:
      'Search the indexed documents for passages relevant to a query. Returns ranked, cited ' +
      'snippets. If results are weak or off-topic, call again with a reworded query.',
    schema: z.object({ query: z.string(), k: z.number().optional() })
  }
);
```

## 3. The agent: a search tool, memory, and a steering prompt

The "agentic" behavior — query expansion, corrective retries, clarification, citations — lives in the **system prompt**, not in extra code. The loop supplies the retries.

```ts
import { createAgent, createMiddleware } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';

const SYSTEM_PROMPT = `You are a meticulous research assistant. Answer ONLY from the indexed documents.
1. Search before answering. Read the passages and their scores.
2. If results are weak or off-topic, REWRITE the query and search again (synonyms, simpler terms,
   or split a multi-part question into separate searches). Try a few times before giving up.
3. If the question is ambiguous or the documents don't cover it, do NOT guess — ask one short
   clarifying question, or say plainly that the documents don't cover it.
4. Cite every claim inline with the passage ids, like [S1] or [S2][S3]. Only cite what you used.
5. Be warm, clear, and concise. Never invent sources or facts.`;

// A tiny custom middleware — observe (or authorize / cache / rewrite) each tool call.
const retrievalTracer = createMiddleware({
  name: 'retrieval-tracer',
  wrapToolCall: (request, handler) => {
    if (request.toolCall?.name === 'search_documents') console.log('search:', request.toolCall.args);
    return handler(request); // call through
  }
});

const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',
  tools: [searchDocuments],
  systemPrompt: SYSTEM_PROMPT,
  middleware: [retrievalTracer],
  checkpointer: new MemorySaver() // multi-turn memory
});
```

## 4. Chat — multi-turn, with memory

Reuse the same `thread_id` so each turn continues the conversation. Clarification is just the agent answering with a question; the user's next turn flows back in.

```ts
const config = { configurable: { thread_id: 'chat-1' } };

async function ask(question: string) {
  const result = await agent.invoke({ messages: [{ role: 'user', content: question }] }, config);
  return result.messages.at(-1)?.content; // the cited answer (or a clarifying question)
}

await indexDocs([{ source: 'policy.txt', text: '…' }]);
console.log(await ask('How long is the espresso machine warranty, and what is not covered?'));
console.log(await ask('And the grinder?')); // "the grinder" resolves from memory
```

To **watch the loop**, stream with `streamMode: 'updates'` (one chunk per node: `model_request → tools → model_request → …`). To **render citations**, parse `[S#]` out of the answer and map each id back to the passage your search tool returned that turn.

## Things to get right

- **Retrieval is a tool, not a pre-step.** Don't pre-retrieve and stuff the prompt — give the agent `search_documents` and let it decide. That's what enables re-querying and clarification.
- **Make scores and ids visible to the model.** Returning `score` lets it judge weak results; returning `id` lets it cite. Both are just fields in the JSON the tool returns.
- **Ground hard in the prompt.** "Answer ONLY from the documents" + "cite every claim" is what separates a RAG agent from a confident hallucinator.
- **A checkpointer is what makes it a conversation.** Same `thread_id` across turns. (`MemorySaver` for dev; swap a Postgres/SQLite saver for production.)
- **Cap the loop if needed.** Add `toolCallLimitMiddleware({ toolName: 'search_documents', runLimit: 6 })` so an over-eager re-query loop terminates.
- **Browser note:** all of the above runs in the browser. The one thing that does *not* is middleware that calls `interrupt()` (human-in-the-loop) — native `await` can't carry the run context client-side. Keep clarification conversational (the agent asks; the user replies) and you stay fully in `createAgent`.

## Middleware worth adding (all from `langchain`)

`toolCallLimitMiddleware` (cap searches), `summarizationMiddleware` (compact long chats), `piiMiddleware` (redact sensitive data), `modelFallbackMiddleware` + `modelRetryMiddleware` (reliability). Stack what you need — that's the same composition a Deep Agent is built from.

## Verify

- Ask a question whose answer is in the docs → the agent calls `search_documents`, then answers with `[S#]` citations you can resolve to real passages.
- Ask something vague → it asks a clarifying question instead of guessing.
- Ask a follow-up using "it"/"that" → memory resolves the reference (same `thread_id`).
- Ask about something absent → it says the documents don't cover it, rather than inventing an answer.
