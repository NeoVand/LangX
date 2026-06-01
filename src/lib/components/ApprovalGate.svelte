<script lang="ts">
	/**
	 * The human side of human-in-the-loop. When an agent pauses on a gated tool,
	 * this card surfaces the proposed call and lets a person approve it, edit its
	 * arguments, or reject it with a message. Emits a decision in the exact shape
	 * LangChain's `Command({ resume })` expects.
	 */
	interface PendingAction {
		name: string;
		args: Record<string, unknown>;
		description?: string;
		allowedDecisions: ('approve' | 'edit' | 'reject')[];
	}
	type ReviewDecision =
		| { type: 'approve' }
		| { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } }
		| { type: 'reject'; message?: string };

	let {
		pending,
		busy = false,
		onDecision
	}: {
		pending: PendingAction;
		busy?: boolean;
		onDecision: (d: ReviewDecision) => void;
	} = $props();

	let mode = $state<'view' | 'edit' | 'reject'>('view');
	// Editable copies of the proposed args, seeded when the human chooses "Edit".
	let draft = $state<Record<string, string>>({});
	let rejectMsg = $state('');

	const allow = (d: 'approve' | 'edit' | 'reject') => pending.allowedDecisions.includes(d);

	function startEdit() {
		draft = Object.fromEntries(Object.entries(pending.args).map(([k, v]) => [k, String(v)]));
		mode = 'edit';
	}

	function confirmEdit() {
		// Coerce each field back to its original JSON type (numbers stay numbers).
		const args: Record<string, unknown> = {};
		for (const [k, original] of Object.entries(pending.args)) {
			const raw = draft[k] ?? '';
			args[k] = typeof original === 'number' ? Number(raw) : raw;
		}
		onDecision({ type: 'edit', editedAction: { name: pending.name, args } });
	}
</script>

<div class="gate" class:busy>
	<div class="gate-head">
		<span class="badge">⏸ Approval required</span>
		<span class="tool">{pending.name}</span>
	</div>
	{#if pending.description}
		<p class="desc">{pending.description}</p>
	{/if}

	<dl class="args">
		{#each Object.entries(pending.args) as [k, v] (k)}
			<div class="arg">
				<dt>{k}</dt>
				<dd>
					{#if mode === 'edit'}
						<input bind:value={draft[k]} disabled={busy} spellcheck="false" />
					{:else}
						<code>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</code>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>

	{#if mode === 'reject'}
		<label class="reject-field">
			<span>Message to the agent (why you're rejecting)</span>
			<textarea
				bind:value={rejectMsg}
				rows="2"
				disabled={busy}
				placeholder="e.g. Per policy, damaged-in-transit items are replaced, not refunded."
			></textarea>
		</label>
	{/if}

	<div class="actions">
		{#if mode === 'view'}
			{#if allow('approve')}
				<button class="act approve" onclick={() => onDecision({ type: 'approve' })} disabled={busy}>
					Approve
				</button>
			{/if}
			{#if allow('edit')}
				<button class="act" onclick={startEdit} disabled={busy}>Edit…</button>
			{/if}
			{#if allow('reject')}
				<button class="act reject" onclick={() => (mode = 'reject')} disabled={busy}>Reject…</button>
			{/if}
		{:else if mode === 'edit'}
			<button class="act approve" onclick={confirmEdit} disabled={busy}>Approve edited</button>
			<button class="act" onclick={() => (mode = 'view')} disabled={busy}>Cancel</button>
		{:else}
			<button
				class="act reject"
				onclick={() => onDecision({ type: 'reject', message: rejectMsg.trim() || undefined })}
				disabled={busy}
			>
				Send rejection
			</button>
			<button class="act" onclick={() => (mode = 'view')} disabled={busy}>Cancel</button>
		{/if}
	</div>
</div>

<style>
	.gate {
		margin-top: 0.9rem;
		padding: 0.85rem 0.95rem;
		border: 1px solid var(--accent);
		border-radius: 0.6rem;
		background: color-mix(in oklch, var(--accent) 8%, var(--color-paper));
		transition: opacity 0.15s ease;
	}
	.gate.busy {
		opacity: 0.6;
		pointer-events: none;
	}
	.gate-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.badge {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--accent);
	}
	.tool {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-ink-100);
	}
	.desc {
		margin: 0.4rem 0 0;
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--color-ink-200);
	}

	.args {
		margin: 0.7rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.arg {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: 0.5rem;
		align-items: center;
	}
	.arg dt {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-300);
	}
	.arg dd {
		margin: 0;
		min-width: 0;
	}
	.arg dd code {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--accent);
		word-break: break-word;
	}
	.arg input {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--font-mono);
		font-size: 0.76rem;
	}

	.reject-field {
		display: block;
		margin-top: 0.7rem;
	}
	.reject-field span {
		display: block;
		font-size: 0.74rem;
		color: var(--color-ink-300);
		margin-bottom: 0.3rem;
	}
	.reject-field textarea {
		width: 100%;
		box-sizing: border-box;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.85rem;
	}
	.act {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		padding: 0.35rem 0.8rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		color: var(--color-ink-100);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.act:hover:not(:disabled) {
		border-color: var(--accent-rule);
		color: var(--accent);
	}
	.act:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.act.approve {
		border-color: var(--accent);
		color: var(--accent);
	}
	.act.reject:hover:not(:disabled) {
		border-color: var(--color-accent-warning, #d9893f);
		color: var(--color-accent-warning, #d9893f);
	}
</style>
