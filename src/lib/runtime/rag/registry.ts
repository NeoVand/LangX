import type { Embeddings } from '@langchain/core/embeddings';
import { app } from '$lib/state/app.svelte';
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
		label: 'Local · MiniLM',
		detail: 'all-MiniLM-L6-v2, 384-dim, runs in-browser (bundled, no network)',
		available: () => true
	},
	{
		id: 'openai',
		label: 'OpenAI · text-embedding-3-small',
		detail: '1536-dim, needs an OpenAI key',
		available: () => !!app.keys.openai
	},
	{
		id: 'voyage',
		label: 'Voyage · voyage-3.5',
		detail: '1024-dim, needs a Voyage key',
		available: () => !!app.keys.voyage
	}
];

export async function makeEmbeddings(id: EmbeddingsProviderId): Promise<Embeddings> {
	if (id === 'openai') {
		const { OpenAIEmbeddings } = await import('@langchain/openai');
		return new OpenAIEmbeddings({
			apiKey: app.keys.openai,
			model: 'text-embedding-3-small'
		});
	}
	if (id === 'voyage') {
		return new VoyageEmbeddings({ apiKey: app.keys.voyage, model: 'voyage-3.5' });
	}
	return new MiniLmEmbeddings();
}
