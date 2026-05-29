import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings';

export interface VoyageEmbeddingsParams extends EmbeddingsParams {
	apiKey: string;
	model?: string;
}

/**
 * Minimal fetch-based adapter for Voyage AI embeddings (no SDK needed).
 * POST https://api.voyageai.com/v1/embeddings
 */
export class VoyageEmbeddings extends Embeddings {
	private apiKey: string;
	private model: string;

	constructor(params: VoyageEmbeddingsParams) {
		super(params);
		this.apiKey = params.apiKey;
		this.model = params.model ?? 'voyage-3.5';
	}

	private async embed(input: string[], inputType: 'query' | 'document'): Promise<number[][]> {
		const res = await fetch('https://api.voyageai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`
			},
			body: JSON.stringify({ input, model: this.model, input_type: inputType })
		});
		if (!res.ok) {
			throw new Error(`Voyage embeddings failed (${res.status}): ${await res.text()}`);
		}
		const json = (await res.json()) as { data: { embedding: number[] }[] };
		return json.data.map((d) => d.embedding);
	}

	async embedQuery(text: string): Promise<number[]> {
		const [v] = await this.embed([text], 'query');
		return v;
	}

	async embedDocuments(documents: string[]): Promise<number[][]> {
		return this.embed(documents, 'document');
	}
}
