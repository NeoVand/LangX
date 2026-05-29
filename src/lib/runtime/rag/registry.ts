import type { Embeddings } from '@langchain/core/embeddings';
import { app } from '$lib/state/app.svelte';
import { findEmbeddingModel } from '$lib/models/catalog';
import { MiniLmEmbeddings } from './embeddings';
import { VoyageEmbeddings } from './voyage';

export type EmbeddingsProviderId = 'local' | 'openai' | 'voyage';

export interface EmbeddingsProviderInfo {
	id: EmbeddingsProviderId;
	label: string;
	detail: string;
	/** Whether the provider can be used given current keys. */
	available: () => boolean;
}

export const EMBEDDINGS_PROVIDERS: EmbeddingsProviderInfo[] = [
	{
		id: 'local',
		label: 'Local',
		detail: 'all-MiniLM-L6-v2, 384-dim, runs in-browser (bundled, no network)',
		available: () => true
	},
	{
		id: 'openai',
		label: 'OpenAI',
		detail: 'Hosted OpenAI embeddings · needs an OpenAI key',
		available: () => !!app.keys.openai
	},
	{
		id: 'voyage',
		label: 'Voyage',
		detail: 'Hosted Voyage embeddings · needs a Voyage key',
		available: () => !!app.keys.voyage
	}
];

export async function makeEmbeddings(id: EmbeddingsProviderId): Promise<Embeddings> {
	if (id === 'openai') {
		const { OpenAIEmbeddings } = await import('@langchain/openai');
		return new OpenAIEmbeddings({
			apiKey: app.keys.openai,
			model: app.embeddingModels.openai,
			// Mirror the chat path: the OpenAI SDK refuses to run in a browser without this.
			configuration: { dangerouslyAllowBrowser: true }
		});
	}
	if (id === 'voyage') {
		return new VoyageEmbeddings({ apiKey: app.keys.voyage, model: app.embeddingModels.voyage });
	}
	return new MiniLmEmbeddings();
}

/** Display label for the embedding model currently selected for a provider. */
export function activeEmbeddingModelLabel(id: EmbeddingsProviderId): string {
	if (id === 'local') return 'all-MiniLM-L6-v2';
	const selected = app.embeddingModels[id];
	return findEmbeddingModel(selected)?.label ?? selected;
}
