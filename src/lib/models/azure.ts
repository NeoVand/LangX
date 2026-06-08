/**
 * Helpers for the user-added Azure OpenAI models (keyless / Entra ID auth).
 *
 * Unlike the curated hosted models in `catalog.ts`, Azure models are supplied by
 * the user at runtime: they paste a deployment endpoint on the Setup page and we
 * derive everything we need from it. No endpoints are ever bundled with the app.
 *
 * The actual network calls are proxied through the local `/api/azure` middleware
 * (see `vite-plugins/azure-keyless-proxy.ts`), which injects a bearer token from
 * the developer's `az login` session — so no API key is entered or stored.
 */

/** Same-origin base URL the OpenAI SDK points at; the proxy adds the real auth. */
export function azureProxyBaseUrl(): string {
	const origin =
		typeof globalThis !== 'undefined' &&
		(globalThis as { location?: { origin?: string } }).location?.origin;
	return `${origin || ''}/api/azure`;
}

export interface ParsedAzureEndpoint {
	/** Deployment name from `/deployments/<name>/`. */
	deployment: string;
	/** `api-version` query parameter, if present. */
	apiVersion: string | null;
	/** Whether the endpoint targets chat completions or embeddings. */
	kind: 'chat' | 'embedding' | 'unknown';
}

/**
 * Pull the deployment name, api-version, and endpoint kind out of a full Azure
 * OpenAI endpoint URL such as:
 *   https://<resource>.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview
 *   https://<resource>.cognitiveservices.azure.com/openai/deployments/text-embedding-3-large/embeddings?api-version=2023-05-15
 */
export function parseAzureEndpoint(raw: string): ParsedAzureEndpoint | null {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	if (u.protocol !== 'https:') return null;
	const host = u.hostname.toLowerCase();
	if (!host.endsWith('.azure.com')) return null;

	const deployMatch = u.pathname.match(/\/deployments\/([^/]+)/i);
	if (!deployMatch) return null;
	const deployment = decodeURIComponent(deployMatch[1]);

	let kind: ParsedAzureEndpoint['kind'] = 'unknown';
	if (/\/embeddings\b/i.test(u.pathname)) kind = 'embedding';
	else if (/\/(chat\/completions|completions|responses)\b/i.test(u.pathname)) kind = 'chat';

	return { deployment, apiVersion: u.searchParams.get('api-version'), kind };
}

/**
 * Heuristic for Azure deployments that are reasoning models (GPT-5.x, o-series):
 * they reject a custom `temperature` and meter output with `max_completion_tokens`,
 * so the runtime sends the minimal parameter surface for them — mirroring the
 * OpenAI branch in `runtime/llm`.
 */
export function isReasoningDeployment(deployment: string): boolean {
	return /(?:^|[-_/])(?:o\d|gpt-5)/i.test(deployment);
}
