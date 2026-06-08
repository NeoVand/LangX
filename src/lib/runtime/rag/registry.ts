import type { Embeddings } from '@langchain/core/embeddings';
import { app, selectedAzureEmbeddingModel } from '$lib/state/app.svelte';
import { findEmbeddingModel } from '$lib/models/catalog';
import { azureProxyBaseUrl } from '$lib/models/azure';
import { MiniLmEmbeddings } from './embeddings';
import { VoyageEmbeddings } from './voyage';

export type EmbeddingsProviderId = 'local' | 'openai' | 'voyage' | 'azure';

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
	},
	{
		id: 'azure',
		label: 'Azure',
		detail: 'Azure OpenAI embeddings · keyless (az login), no API key',
		available: () => !!selectedAzureEmbeddingModel()
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
	if (id === 'azure') {
		const model = selectedAzureEmbeddingModel();
		if (!model) throw new Error('No Azure embedding deployment selected. Add one on /setup.');
		const { OpenAIEmbeddings } = await import('@langchain/openai');
		// Keyless: routed through the local /api/azure proxy, which injects the token.
		return new OpenAIEmbeddings({
			apiKey: 'keyless',
			model: model.deployment,
			configuration: {
				baseURL: azureProxyBaseUrl(),
				defaultHeaders: { 'x-azure-endpoint': model.endpoint },
				dangerouslyAllowBrowser: true
			}
		});
	}
	return new MiniLmEmbeddings();
}

/** Display label for the embedding model currently selected for a provider. */
export function activeEmbeddingModelLabel(id: EmbeddingsProviderId): string {
	if (id === 'local') return 'all-MiniLM-L6-v2';
	if (id === 'azure') return selectedAzureEmbeddingModel()?.label ?? 'Azure embedding';
	const selected = app.embeddingModels[id];
	return findEmbeddingModel(selected)?.label ?? selected;
}
