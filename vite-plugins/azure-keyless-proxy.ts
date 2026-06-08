import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Local-only keyless proxy for Azure OpenAI.
 *
 * The browser cannot run `DefaultAzureCredential` (it reads Azure CLI / managed
 * identity tokens, which only exist in a Node process), so this Vite middleware
 * sits in front of the user's Azure OpenAI endpoints. The client talks to it as
 * if it were an OpenAI-compatible server (`/api/azure/chat/completions`,
 * `/api/azure/embeddings`); the middleware acquires a bearer token via the
 * developer's existing `az login` session and forwards the request — no API key
 * is ever entered or stored.
 *
 * Mounted only on the dev and preview servers (this app ships as a static SPA),
 * which is exactly the "running locally" scenario keyless auth requires.
 */

const MOUNT = '/api/azure';
const TOKEN_SCOPE = 'https://cognitiveservices.azure.com/.default';

/** Restrict the proxy target to Azure hosts so it can't be turned into an SSRF relay. */
function allowedAzureUrl(raw: string | undefined): URL | null {
	if (!raw) return null;
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	if (u.protocol !== 'https:') return null;
	const host = u.hostname.toLowerCase();
	if (
		host.endsWith('.openai.azure.com') ||
		host.endsWith('.cognitiveservices.azure.com') ||
		host.endsWith('.azure.com')
	) {
		return u;
	}
	return null;
}

function headerValue(v: string | string[] | undefined): string | undefined {
	return Array.isArray(v) ? v[0] : v;
}

/** Does the host match an entry in NO_PROXY (supports leading-dot / suffix matches)? */
function bypassesProxy(host: string): boolean {
	const raw = process.env.NO_PROXY || process.env.no_proxy || '';
	const h = host.toLowerCase();
	for (const entry of raw.split(',')) {
		const e = entry.trim().toLowerCase().replace(/^\*?\.?/, '');
		if (!e) continue;
		if (e === '*') return true;
		if (h === e || h.endsWith('.' + e) || h.endsWith(e)) return true;
	}
	return false;
}

/**
 * Node's global `fetch` (undici) ignores HTTP(S)_PROXY env vars, so behind a
 * corporate proxy a direct connection to Azure fails with "fetch failed" even
 * though the Azure CLI token (which shells out to `az`) succeeds. Build an
 * undici ProxyAgent dispatcher for hosts that should go through the proxy.
 */
function proxyUrlForHost(host: string): string | null {
	if (bypassesProxy(host)) return null;
	const url = process.env.HTTPS_PROXY || process.env.https_proxy || null;
	return url || null;
}

function errMessage(err: unknown): string {
	if (err instanceof Error) {
		const cause = (err as { cause?: unknown }).cause;
		const causeMsg =
			cause instanceof Error
				? cause.message
				: cause && typeof cause === 'object' && 'code' in cause
					? String((cause as { code: unknown }).code)
					: '';
		return causeMsg ? `${err.message} (${causeMsg})` : err.message;
	}
	return String(err);
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body);
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(payload);
}

export function azureKeylessProxy(): Plugin {
	// Cached credential + token, shared across requests for the dev session.
	let credential: import('@azure/identity').TokenCredential | null = null;
	let cached: { token: string; expiresOnTimestamp: number } | null = null;
	// Cached undici ProxyAgent dispatchers, keyed by proxy URL.
	const dispatchers = new Map<string, import('undici').Dispatcher>();

	async function getToken(): Promise<string> {
		if (cached && cached.expiresOnTimestamp - Date.now() > 60_000) return cached.token;
		const { DefaultAzureCredential } = await import('@azure/identity');
		credential ??= new DefaultAzureCredential();
		const tok = await credential.getToken(TOKEN_SCOPE);
		if (!tok?.token) throw new Error('Azure credential returned no token.');
		cached = { token: tok.token, expiresOnTimestamp: tok.expiresOnTimestamp };
		return tok.token;
	}

	async function dispatcherFor(host: string): Promise<import('undici').Dispatcher | undefined> {
		const proxyUrl = proxyUrlForHost(host);
		if (!proxyUrl) return undefined;
		let agent = dispatchers.get(proxyUrl);
		if (!agent) {
			const { ProxyAgent } = await import('undici');
			agent = new ProxyAgent(proxyUrl);
			dispatchers.set(proxyUrl, agent);
		}
		return agent;
	}

	async function forward(target: URL, body: string): Promise<Response> {
		const token = await getToken();
		const dispatcher = await dispatcherFor(target.hostname);
		// Use undici's own fetch (not the Node global) so the ProxyAgent dispatcher
		// matches the undici version — mixing versions throws "invalid onRequestStart
		// method". This is also what makes the corporate HTTPS proxy work at all,
		// since the global fetch ignores HTTPS_PROXY env vars.
		const { fetch: undiciFetch } = await import('undici');
		return undiciFetch(target.href, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
			body,
			dispatcher
		}) as unknown as Promise<Response>;
	}

	/** Lightweight connectivity + auth check for one endpoint, returns {ok,message}. */
	async function handleTest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const raw = await readBody(req);
		let parsed: { endpoint?: string; kind?: 'chat' | 'embedding' };
		try {
			parsed = JSON.parse(raw || '{}');
		} catch {
			return sendJson(res, 400, { ok: false, message: 'Invalid JSON body.' });
		}
		const target = allowedAzureUrl(parsed.endpoint);
		if (!target) {
			return sendJson(res, 400, {
				ok: false,
				message: 'Endpoint must be an https Azure URL (*.azure.com).'
			});
		}

		try {
			await getToken();
		} catch (err) {
			return sendJson(res, 200, {
				ok: false,
				message: `Keyless sign-in failed: ${errMessage(err)} — run \`az login\` in your terminal, then retry.`
			});
		}

		const kind = parsed.kind === 'embedding' ? 'embedding' : 'chat';
		try {
			let azRes: Response;
			if (kind === 'embedding') {
				azRes = await forward(target, JSON.stringify({ input: 'ping' }));
			} else {
				// max_completion_tokens for modern (reasoning-capable) deployments; fall
				// back to max_tokens if the api-version rejects the newer parameter.
				azRes = await forward(
					target,
					JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_completion_tokens: 16 })
				);
				if (azRes.status === 400) {
					azRes = await forward(
						target,
						JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 16 })
					);
				}
			}
			const text = await azRes.text();
			if (azRes.ok) {
				return sendJson(res, 200, {
					ok: true,
					message:
						kind === 'embedding'
							? 'Authenticated — embedding endpoint responded.'
							: 'Authenticated — chat endpoint responded.'
				});
			}
			return sendJson(res, 200, {
				ok: false,
				message: `Azure returned ${azRes.status}: ${text.slice(0, 200)}`
			});
		} catch (err) {
			return sendJson(res, 200, { ok: false, message: errMessage(err) });
		}
	}

	/** Proxy an OpenAI-compatible request (chat/completions, embeddings) to Azure. */
	async function handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const target = allowedAzureUrl(headerValue(req.headers['x-azure-endpoint']));
		if (!target) {
			return sendJson(res, 400, {
				error: { message: 'Missing or invalid x-azure-endpoint header (must be an *.azure.com URL).' }
			});
		}
		const body = await readBody(req);
		let azRes: Response;
		try {
			azRes = await forward(target, body);
		} catch (err) {
			return sendJson(res, 502, { error: { message: `Azure request failed: ${errMessage(err)}` } });
		}
		res.statusCode = azRes.status;
		const ct = azRes.headers.get('content-type');
		if (ct) res.setHeader('content-type', ct);
		if (azRes.body) {
			Readable.fromWeb(azRes.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
		} else {
			res.end();
		}
	}

	async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
		if (req.method !== 'POST') {
			res.statusCode = 405;
			res.end('Method Not Allowed');
			return;
		}
		// Mounted at MOUNT, so req.url is the remainder: '/test', '/chat/completions', ...
		const path = (req.url || '').split('?')[0];
		if (path === '/test' || path === 'test') {
			await handleTest(req, res);
			return;
		}
		await handleProxy(req, res);
	}

	function mount(server: ViteDevServer | PreviewServer) {
		server.middlewares.use(MOUNT, (req, res) => {
			dispatch(req, res).catch((err) => {
				if (!res.headersSent) sendJson(res, 500, { error: { message: errMessage(err) } });
				else res.end();
			});
		});
	}

	return {
		name: 'langx-azure-keyless-proxy',
		enforce: 'pre',
		configureServer(server) {
			mount(server);
		},
		configurePreviewServer(server) {
			mount(server);
		}
	};
}
