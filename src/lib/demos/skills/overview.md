---
name: langchain-handwired-chatbot
description: Rebuild a multimodal RAG chatbot from raw LangChain v1 (TypeScript) parts — a document-loader Runnable, in-memory vector retrieval, conversation memory as a message list, an image turn, and a token-streamed reply with optional extended thinking. No createAgent. Use when building a transparent chatbot loop in LangChain JS, or explaining how memory + RAG + multimodal fit together.
---

# Build a hand-wired multimodal RAG chatbot

Recreate a working chatbot from raw LangChain pieces — **no `createAgent`** — so every moving part is visible: memory, retrieval, a multimodal image turn, and a streamed reply. This is the "see the whole machine before taking it apart" demo.

## When to use this

- You want a chatbot you fully control, not a black-box agent.
- You need answers grounded in a user's document (RAG) and/or an image.
- You want to stream the reply (and optionally the model's reasoning) token by token.

## Prerequisites

- Node 18+ and a TypeScript project.
- `npm i langchain @langchain/core @langchain/anthropic` (or `@langchain/openai` / `@langchain/google-genai`).
- For retrieval embeddings outside the browser: `npm i @langchain/openai` and set `OPENAI_API_KEY`. (The in-browser demo runs a local MiniLM model instead.)
- A chat-model API key, e.g. `ANTHROPIC_API_KEY`.

## Core idea

A chat model is **stateless** — each call only knows what you send it. So a chatbot is a loop over a growing **message list** (that list *is* the memory):

```
keep a message list  →  add the user turn (+ retrieved context, + image)
  →  send the whole list to the model  →  append the reply  →  repeat
```

Everything else (RAG, multimodal, thinking) is extra content stitched into the user turn before the model call.

## Steps

### 1. Memory = a message list

```ts
import { SystemMessage, HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';

const SYSTEM = new SystemMessage('You are a helpful assistant. Use any provided context.');
const memory: BaseMessage[] = []; // the running conversation
```

### 2. Load a document, then retrieve (RAG)

Loading a file is just another Runnable; then split → embed → store → query.

```ts
// Split the document text into chunks, embed each, and keep them in a vector store.
const store = await buildStore(chunkDocuments([{ source: 'notes.md', text }]));

// At question time, pull back the nearest chunks by cosine similarity.
const hits = await store.similaritySearch(question, 3); // → top-k Document[]
```

### 3. Build the user turn (context + image = multimodal)

A multimodal `HumanMessage` carries text **and** an image part in one message.

```ts
function buildHumanMessage(question: string, hits: Doc[], imageDataUrl?: string) {
  const context = hits.map((h, i) => `[${i + 1}] ${h.pageContent}`).join('\n');
  const text = context ? `Context:\n${context}\n\nQuestion: ${question}` : question;
  const content: any[] = [{ type: 'text', text }];
  if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  return new HumanMessage({ content });
}
```

### 4. Stream the reply (and optionally the reasoning)

Send `[system, ...memory, humanTurn]` and stream tokens. Concatenate chunks for `usage_metadata`.

```ts
const human = buildHumanMessage(question, hits, imageDataUrl);
const messages = [SYSTEM, ...memory, human];

let answer = '';
for await (const chunk of await model.stream(messages)) {
  // extended-thinking blocks arrive as content of type 'thinking' / 'reasoning'
  const piece = typeof chunk.content === 'string' ? chunk.content : '';
  answer += piece;
  process.stdout.write(piece);
}

memory.push(human, new AIMessage(answer)); // grow memory for the next turn
```

### 5. Extended thinking (optional)

For models that expose reasoning (Claude, Gemini), enable it and stream the thinking separately:

```ts
// Anthropic: thinking: { type: 'enabled', budget_tokens: 1024 } (needs temperature 1, max_tokens > budget)
// The reasoning streams as content blocks of type 'thinking' before the answer text.
```

OpenAI GPT-5.x reasons internally and does **not** expose those tokens, so only offer the toggle when the model can actually show its work.

## Things to get right

- **The greeting is UI-only** — don't put it in `memory`, or the model will treat it as its own prior turn.
- **Pass the whole list every turn.** There is no server-side session; memory is just the array you resend.
- **Retrieval feeds the prompt, it isn't the prompt.** Paste the top-k chunks verbatim into the user turn and let the model cite them.
- **Multimodal is one message, two parts.** Add an `image_url` part to the same `HumanMessage`; don't send a separate message.
- **Usage:** to get `usage_metadata` while streaming, concatenate the `AIMessageChunk`s (`acc = acc.concat(chunk)`), then read it off the accumulated message.

## Verify

- Ask a follow-up that depends on the previous answer — it should remember (memory works).
- Upload a document and ask about it — the answer should quote the retrieved chunks (RAG works).
- Attach an image and ask "what's in this?" — the reply should describe it (multimodal works).
- The reply appears token by token (streaming works).
