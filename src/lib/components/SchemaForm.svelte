<script lang="ts">
	// Renders a parsed object AS its schema: each field shows its name, the type /
	// constraint the schema enforces, and the value the model filled in. This is the
	// point of structured output made visible — your shape, filled and validated.
	interface FieldSpec {
		key: string;
		/** Short type label, e.g. string · enum · number · string[] · boolean. */
		type: string;
		/** The constraint detail, e.g. "low · medium · high" or "max 5" or "0–1". */
		note?: string;
	}
	let { fields, value }: { fields: FieldSpec[]; value: Record<string, unknown> } = $props();

	function filled(v: unknown): boolean {
		if (v === undefined || v === null || v === '') return false;
		if (Array.isArray(v)) return v.length > 0;
		return true;
	}
</script>

<div class="schema-form">
	{#each fields as f (f.key)}
		{@const v = value?.[f.key]}
		<div class="field">
			<div class="field-head">
				<span class="key">{f.key}</span>
				<span class="type">{f.type}</span>
				{#if f.note}<span class="note">{f.note}</span>{/if}
				<span class="ok" class:filled={filled(v)}>{filled(v) ? '✓' : '—'}</span>
			</div>
			<div class="val">
				{#if Array.isArray(v)}
					<ul class="arr">
						{#each v as item, i (i)}<li>{item}</li>{/each}
					</ul>
				{:else if typeof v === 'boolean'}
					<span class="bool" class:t={v}>{v ? 'true' : 'false'}</span>
				{:else if typeof v === 'number'}
					<span class="num">{v}</span>
				{:else if f.type.startsWith('enum') && typeof v === 'string'}
					<span class="enum">{v}</span>
				{:else}
					<span class="scalar">{v ?? '—'}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.schema-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.field {
		padding: 0.55rem 0.7rem;
		border-radius: 0.5rem;
		background: var(--color-paper);
	}
	.field-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.key {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink-100);
		font-weight: 500;
	}
	.type {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		color: var(--accent);
	}
	.note {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-300);
	}
	.ok {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--color-ink-300);
	}
	.ok.filled {
		color: var(--color-accent-success, var(--accent));
	}
	.val {
		margin-top: 0.3rem;
		font-family: var(--font-prose);
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--color-ink-100);
	}
	.arr {
		margin: 0;
		padding-left: 1.2rem;
	}
	.arr li {
		margin: 0.1rem 0;
	}
	.enum {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		padding: 0.1rem 0.45rem;
		border-radius: 0.35rem;
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		color: var(--accent);
	}
	.num {
		font-family: var(--font-mono);
		color: var(--color-ink-100);
	}
	.bool {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-accent-danger, var(--color-ink-200));
	}
	.bool.t {
		color: var(--color-accent-success, var(--accent));
	}
</style>
