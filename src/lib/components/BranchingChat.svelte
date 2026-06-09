<script lang="ts" module>
	export interface RunTurn {
		(
			text: string,
			resume: { threadId: string; checkpointId: string } | null,
			onToken: (full: string) => void
		): Promise<{ text: string; threadId: string; checkpointId: string }>;
	}
</script>

<script lang="ts">
	import Markdown from '$lib/components/Markdown.svelte';
	import { ArrowUp, Pencil, RefreshCw, Copy, Check, X, ChevronLeft, ChevronRight } from '@lucide/svelte';

	interface Props {
		/** Run one turn: stream tokens via onToken, resolve with reply + new checkpoint id. */
		runTurn: RunTurn;
		title?: string;
		threadLabel?: string;
		placeholder?: string;
		starters?: string[];
		/** Lifecycle hooks (e.g. to drive a live graph alongside the chat). */
		onTurnStart?: (humanText: string) => void;
		onStreaming?: (full: string) => void;
		onTurnEnd?: (result: { text: string; threadId: string; checkpointId: string }) => void;
		onNewThread?: () => void;
	}
	let {
		runTurn,
		title = 'Assistant',
		threadLabel = '',
		placeholder = 'Message the assistant…',
		starters = [],
		onTurnStart,
		onStreaming,
		onTurnEnd,
		onNewThread
	}: Props = $props();

	// ── Message tree (ChatGPT / Open WebUI model) ────────────────────────────────
	interface MsgNode {
		id: string;
		role: 'user' | 'assistant';
		text: string;
		parentId: string;
		children: string[];
		threadId?: string; // the thread this turn ran on
		checkpointId?: string; // assistant nodes: the checkpoint saved after this turn
	}
	function freshRoot(): Record<string, MsgNode> {
		return { root: { id: 'root', role: 'assistant', text: '', parentId: '', children: [] } };
	}
	let nodes = $state<Record<string, MsgNode>>(freshRoot());
	let leafId = $state('root');
	let counter = 0;
	let busy = $state(false);
	let streamingId = $state<string | null>(null);
	let draft = $state('');
	let editingId = $state<string | null>(null);
	let editText = $state('');
	let copiedId = $state<string | null>(null);

	const path = $derived.by(() => {
		const out: MsgNode[] = [];
		let cur: string = leafId;
		while (cur && cur !== 'root') {
			const n = nodes[cur];
			if (!n) break;
			out.unshift(n);
			cur = n.parentId;
		}
		return out;
	});

	function deepestLeaf(id: string): string {
		let n = nodes[id];
		while (n && n.children.length) n = nodes[n.children[n.children.length - 1]];
		return n ? n.id : id;
	}
	function siblingsOf(id: string): MsgNode[] {
		const n = nodes[id];
		const p = n && nodes[n.parentId];
		return p ? p.children.map((c) => nodes[c]) : [];
	}
	function navSibling(id: string, dir: -1 | 1) {
		if (busy) return;
		const sibs = siblingsOf(id);
		if (sibs.length < 2) return;
		const idx = sibs.findIndex((s) => s.id === id);
		const next = sibs[(idx + dir + sibs.length) % sibs.length];
		leafId = deepestLeaf(next.id);
	}
	function add(role: 'user' | 'assistant', text: string, parentId: string, threadId?: string): MsgNode {
		const id = `n${counter++}`;
		nodes[id] = { id, role, text, parentId, children: [], threadId };
		nodes[parentId].children.push(id);
		return nodes[id];
	}
	/**
	 * Where a new turn under `parentId` should resume from. null = fork from an
	 * empty thread (the page assigns a fresh thread_id); otherwise resume from that
	 * node's saved checkpoint ON ITS THREAD — always explicit, never "latest".
	 */
	function resumeFrom(parentId: string): { threadId: string; checkpointId: string } | null {
		const p = nodes[parentId];
		if (!p || p.id === 'root' || !p.checkpointId || !p.threadId) return null;
		return { threadId: p.threadId, checkpointId: p.checkpointId };
	}

	async function runInto(userText: string, parentForUser: string) {
		busy = true;
		onTurnStart?.(userText);
		const resume = resumeFrom(parentForUser);
		const u = add('user', userText, parentForUser, resume?.threadId);
		const a = add('assistant', '', u.id, resume?.threadId);
		leafId = a.id;
		streamingId = a.id;
		try {
			const res = await runTurn(userText, resume, (full) => {
				nodes[a.id].text = full;
				onStreaming?.(full);
			});
			nodes[a.id].text = res.text;
			nodes[a.id].threadId = res.threadId;
			nodes[a.id].checkpointId = res.checkpointId;
			nodes[u.id].threadId = res.threadId;
			onTurnEnd?.(res);
		} catch (e) {
			nodes[a.id].text = `⚠️ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			streamingId = null;
			busy = false;
		}
	}

	function send() {
		const text = draft.trim();
		if (!text || busy) return;
		draft = '';
		runInto(text, leafId); // continue from the current tip
	}
	function startEdit(m: MsgNode) {
		if (busy) return;
		editingId = m.id;
		editText = m.text;
	}
	function cancelEdit() {
		editingId = null;
		editText = '';
	}
	function saveEdit(m: MsgNode) {
		const text = editText.trim();
		editingId = null;
		if (!text || busy) return;
		// Fork: a new user message as a sibling of m, resuming from m's parent.
		runInto(text, m.parentId);
	}
	async function regenerate(a: MsgNode) {
		if (busy) return;
		const u = nodes[a.parentId]; // the user message that produced this reply
		if (!u) return;
		busy = true;
		onTurnStart?.(u.text);
		const resume = resumeFrom(u.parentId);
		const a2 = add('assistant', '', u.id, resume?.threadId); // sibling reply under the same user msg
		leafId = a2.id;
		streamingId = a2.id;
		try {
			const res = await runTurn(u.text, resume, (full) => {
				nodes[a2.id].text = full;
				onStreaming?.(full);
			});
			nodes[a2.id].text = res.text;
			nodes[a2.id].threadId = res.threadId;
			nodes[a2.id].checkpointId = res.checkpointId;
			onTurnEnd?.(res);
		} catch (e) {
			nodes[a2.id].text = `⚠️ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			streamingId = null;
			busy = false;
		}
	}
	async function copy(m: MsgNode) {
		try {
			await navigator.clipboard.writeText(m.text);
			copiedId = m.id;
			setTimeout(() => (copiedId === m.id ? (copiedId = null) : null), 1200);
		} catch {
			/* clipboard blocked — ignore */
		}
	}
	function newThread() {
		if (busy) return;
		nodes = freshRoot();
		leafId = 'root';
		counter = 0;
		editingId = null;
		draft = '';
		onNewThread?.();
	}
	const activeThread = $derived(nodes[leafId]?.threadId ?? threadLabel);
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
	function sibInfo(id: string) {
		const sibs = siblingsOf(id);
		return { idx: sibs.findIndex((s) => s.id === id) + 1, total: sibs.length };
	}
</script>

<div class="chat">
	<div class="chat-head">
		<div class="chat-head-left">
			<span class="status-dot" class:busy></span>
			<span class="chat-title">{title}</span>
			{#if activeThread}<span class="thread" title="thread_id">{activeThread}</span>{/if}
		</div>
		<div class="head-actions">
			<button class="head-btn new-chat-btn" onclick={newThread} disabled={busy || path.length === 0} title="New thread">
				<Pencil size={14} /><span>New thread</span>
			</button>
		</div>
	</div>

	<div class="messages">
		{#if path.length === 0}
			<div class="welcome">
				<p>Ask me anything — I remember everything on this thread.</p>
				{#if starters.length}
					<div class="starters">
						{#each starters as s (s)}
							<button class="starter" onclick={() => { draft = s; send(); }} disabled={busy}>{s}</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#each path as m (m.id)}
			<div class="msg {m.role}">
				{#if editingId === m.id}
					<div class="edit-area">
						<textarea bind:value={editText} rows="2"></textarea>
						<div class="edit-actions">
							<button class="mini" onclick={cancelEdit} title="Cancel"><X size={14} /></button>
							<button class="mini primary" onclick={() => saveEdit(m)} title="Save & branch"><Check size={14} /></button>
						</div>
					</div>
				{:else}
					{#if m.text}
						<div class="bubble">
							{#if m.role === 'assistant'}<Markdown source={m.text} />{:else}{m.text}{/if}
						</div>
					{:else if m.role === 'assistant' && streamingId === m.id}
						<div class="bubble typing"><span></span><span></span><span></span></div>
					{/if}

					<div class="msg-foot">
						{#if sibInfo(m.id).total > 1}
							<div class="branch-nav" title="Switch between branches">
								<button class="nav-btn" onclick={() => navSibling(m.id, -1)} disabled={busy} aria-label="Previous branch"><ChevronLeft size={13} /></button>
								<span>{sibInfo(m.id).idx}/{sibInfo(m.id).total}</span>
								<button class="nav-btn" onclick={() => navSibling(m.id, 1)} disabled={busy} aria-label="Next branch"><ChevronRight size={13} /></button>
							</div>
						{/if}
						<div class="msg-actions">
							{#if m.role === 'user'}
								<button class="act" onclick={() => startEdit(m)} disabled={busy} title="Edit & branch"><Pencil size={13} /></button>
							{:else if m.text}
								<button class="act" onclick={() => regenerate(m)} disabled={busy} title="Regenerate (new branch)"><RefreshCw size={13} /></button>
								<button class="act" onclick={() => copy(m)} title="Copy">
									{#if copiedId === m.id}<Check size={13} />{:else}<Copy size={13} />{/if}
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<label class="composer">
		<textarea
			class="text-in"
			bind:value={draft}
			rows="1"
			{placeholder}
			disabled={busy}
			onkeydown={onKey}
		></textarea>
		<button class="send" type="button" onclick={send} disabled={busy || !draft.trim()} aria-label="Send">
			<ArrowUp size={18} strokeWidth={2.5} />
		</button>
	</label>
</div>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-rule);
		border-radius: 0.85rem;
		background: var(--color-bg);
		overflow: hidden;
	}
	.chat-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.65rem 0.7rem 0.65rem 1rem;
		background: var(--color-paper);
	}
	.chat-head-left {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.status-dot {
		flex: 0 0 auto;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent);
	}
	.status-dot.busy {
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	.chat-title {
		font-family: var(--font-display);
		font-size: 0.98rem;
		color: var(--color-ink-100);
	}
	.thread {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
	}
	.head-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.head-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		height: 1.9rem;
		padding: 0 0.55rem;
		border-radius: 0.45rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-ink-300);
		font-size: 0.75rem;
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease;
	}
	.head-btn span {
		font-family: var(--font-mono);
	}
	.head-btn:hover:not(:disabled) {
		color: var(--accent);
		background: var(--color-bg);
	}
	.head-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.messages {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.85rem 1rem;
		min-height: 12rem;
		max-height: 26rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 0.3s ease;
	}
	.messages:hover {
		scrollbar-color: color-mix(in oklch, var(--color-fg) 20%, transparent) transparent;
	}
	.welcome {
		margin: auto 0;
		color: var(--color-fg-muted);
		font-size: 0.86rem;
	}
	.welcome p {
		margin: 0 0 0.6rem;
	}
	.starters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.starter {
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-ink-100);
		font-size: 0.78rem;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s ease, color 0.15s ease;
	}
	.starter:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.msg {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		max-width: 88%;
	}
	.msg.user {
		align-self: flex-end;
		align-items: flex-end;
	}
	.msg.assistant {
		align-self: flex-start;
		max-width: 92%;
	}
	.bubble {
		padding: 0.45rem 0.7rem;
		border-radius: 0.9rem;
		font-size: 0.84rem;
		line-height: 1.5;
		word-break: break-word;
	}
	.msg.user .bubble {
		background: var(--accent);
		color: #1a1206;
		border-bottom-right-radius: 0.3rem;
		white-space: pre-wrap;
	}
	.msg.assistant .bubble {
		background: var(--color-bg-elev-2);
		color: var(--color-ink-100);
		border-bottom-left-radius: 0.3rem;
	}
	.msg.assistant .bubble :global(.markdown) {
		font-size: 0.84rem;
		line-height: 1.55;
	}
	.msg.assistant .bubble :global(.markdown p:first-child) {
		margin-top: 0;
	}
	.msg.assistant .bubble :global(.markdown p:last-child) {
		margin-bottom: 0;
	}
	.bubble.typing {
		display: inline-flex;
		gap: 0.25rem;
		align-items: center;
		background: var(--color-bg-elev-2);
	}
	.bubble.typing span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-ink-300);
		animation: blink 1.2s infinite ease-in-out;
	}
	.bubble.typing span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.bubble.typing span:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes blink {
		0%, 80%, 100% {
			opacity: 0.25;
		}
		40% {
			opacity: 1;
		}
	}

	/* Hover controls — kept clean per modern chat UIs (Open WebUI / ChatGPT). */
	.msg-foot {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 1.1rem;
	}
	.msg.user .msg-foot {
		flex-direction: row-reverse;
	}
	.msg-actions {
		display: flex;
		gap: 0.1rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.msg:hover .msg-actions {
		opacity: 1;
	}
	.act {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.35rem;
		border: none;
		background: transparent;
		color: var(--color-ink-300);
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease;
	}
	.act:hover:not(:disabled) {
		color: var(--accent);
		background: var(--color-bg-elev-2);
	}
	.act:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.branch-nav {
		display: inline-flex;
		align-items: center;
		gap: 0.1rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-muted);
	}
	.nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		border: none;
		border-radius: 0.3rem;
		background: transparent;
		color: var(--color-ink-300);
		cursor: pointer;
	}
	.nav-btn:hover:not(:disabled) {
		color: var(--accent);
	}
	.nav-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.edit-area {
		width: min(100%, 22rem);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.edit-area textarea {
		width: 100%;
		resize: vertical;
		font: inherit;
		font-size: 0.84rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--accent-rule);
		border-radius: 0.6rem;
		background: var(--color-bg-elev);
		color: var(--color-ink-100);
	}
	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.3rem;
	}
	.mini {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
		background: var(--color-bg-elev);
		color: var(--color-ink-200);
		cursor: pointer;
	}
	.mini.primary {
		background: var(--accent);
		color: #1a1206;
		border-color: transparent;
	}

	/* ── Composer ──────────────────────────────────────────────────────────── */
	.composer {
		position: relative;
		display: block;
		margin: 0;
		border-top: 1px solid var(--color-rule);
		background: var(--color-bg-elev);
		padding: 0.7rem 3rem 0.7rem 0.85rem;
		cursor: text;
	}
	.composer .text-in,
	.composer .text-in:focus {
		display: block;
		width: 100%;
		border: none;
		background: transparent;
		box-shadow: none;
		resize: none;
		outline: none;
		font-family: var(--font-sans);
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		padding: 0.25rem 0.15rem;
		min-height: 1.6rem;
		max-height: 11rem;
	}
	.composer .text-in::placeholder {
		color: var(--color-fg-faint);
		opacity: 0.6;
	}
	.send {
		position: absolute;
		right: 0.7rem;
		bottom: 0.6rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: #1a1206;
		cursor: pointer;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}
	.send:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.send:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
