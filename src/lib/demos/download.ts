import { zipSync, strToU8 } from 'fflate';

/** One source file shown on the flip side and bundled into the download. */
export interface DemoFile {
	/** Zip-relative path, e.g. `lib/demos/tools-weather.ts`. */
	path: string;
	/** Raw source (usually a Vite `?raw` import). */
	code: string;
	lang?: string;
}

export interface DemoManifest {
	/** Slug used for the folder + zip name. */
	id: string;
	/** Human title for the README + UI. */
	title: string;
	/** One-line description for the README. */
	summary?: string;
	/** The demo's own module(s); their imports are followed to bundle local deps. */
	entries: DemoFile[];
	/** Contents of the generated `index.ts` CLI runner. */
	runner: string;
	/** Extra env vars beyond ANTHROPIC_API_KEY. */
	env?: string[];
	/** Caveats appended to the README (e.g. browser-only embeddings). */
	note?: string;
}

// Every local module under src/lib, available as a raw string at build time.
const LIB_RAW = import.meta.glob('/src/lib/**/*.{ts,js}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

// Pinned versions for the generated package.json (kept in sync with the app).
const VERSIONS: Record<string, string> = {
	'@langchain/core': '^1.1.48',
	'@langchain/anthropic': '^1.4.0',
	'@langchain/openai': '^1.4.7',
	'@langchain/google-genai': '^2.1.31',
	langchain: '^1.4.2',
	'@langchain/langgraph': '^1.3.2',
	'@langchain/textsplitters': '^1.0.1',
	'@observablehq/plot': '^0.6.17',
	zod: '^4.4.3',
	diff: '^9.0.0',
	marked: '^18.0.4'
};

const NODE_BUILTINS = new Set([
	'fs',
	'path',
	'url',
	'crypto',
	'util',
	'stream',
	'os',
	'http',
	'https',
	'events',
	'buffer'
]);

/** A Node-flavoured replacement for the browser `getModel` (reads process.env). */
const LLM_SHIM = `import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface GetModelOptions {
	temperature?: number;
	maxTokens?: number;
}

/**
 * Standalone version of the app's getModel: reads the key from the environment
 * instead of browser state. Set ANTHROPIC_API_KEY in your .env.
 */
export async function getModel(opts: GetModelOptions = {}): Promise<BaseChatModel> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY in .env (copy .env.example).');
	const { ChatAnthropic } = await import('@langchain/anthropic');
	return new ChatAnthropic({
		apiKey,
		model: 'claude-haiku-4-5',
		temperature: opts.temperature ?? 0,
		maxTokens: opts.maxTokens ?? 1024
	}) as unknown as BaseChatModel;
}
`;

/** Node embeddings registry: uses OpenAI instead of the browser MiniLM model. */
const EMBEDDINGS_SHIM = `import type { Embeddings } from '@langchain/core/embeddings';

export type EmbeddingsProviderId = 'local' | 'openai' | 'voyage';

/**
 * Standalone embeddings: the in-browser demo can run a bundled local MiniLM
 * model, which is not available outside the browser, so this uses OpenAI.
 * Set OPENAI_API_KEY in your .env.
 */
export async function makeEmbeddings(_id: EmbeddingsProviderId = 'openai'): Promise<Embeddings> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error('Set OPENAI_API_KEY in .env for embeddings.');
	const { OpenAIEmbeddings } = await import('@langchain/openai');
	return new OpenAIEmbeddings({ apiKey, model: 'text-embedding-3-small' });
}
`;

// Files we never bundle (browser-only); the shims remove the need for them.
const OVERRIDES: Record<string, string> = {
	'lib/runtime/llm/index.ts': LLM_SHIM,
	'lib/runtime/rag/registry.ts': EMBEDDINGS_SHIM
};
const SKIP = new Set(['lib/runtime/llm/transformers-js.ts', 'lib/runtime/llm/worker.ts']);

function dirOf(p: string): string {
	const i = p.lastIndexOf('/');
	return i === -1 ? '' : p.slice(0, i);
}

function joinPosix(base: string, rel: string): string {
	const parts = base.split('/').filter(Boolean);
	for (const seg of rel.split('/')) {
		if (seg === '' || seg === '.') continue;
		if (seg === '..') parts.pop();
		else parts.push(seg);
	}
	return parts.join('/');
}

/** Import specifier (no extension) for `to` as seen from file `from`. */
function relSpecifier(from: string, to: string): string {
	const fromDir = dirOf(from).split('/').filter(Boolean);
	let target = to.replace(/\.(ts|js)$/, '').replace(/\/index$/, '');
	const toParts = target.split('/').filter(Boolean);
	let i = 0;
	while (i < fromDir.length && i < toParts.length && fromDir[i] === toParts[i]) i++;
	const up = fromDir.slice(i).map(() => '..');
	const down = toParts.slice(i);
	let rel = [...up, ...down].join('/');
	if (!rel.startsWith('.')) rel = './' + rel;
	return rel;
}

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiers(code: string): string[] {
	const out: string[] = [];
	let m: RegExpExecArray | null;
	IMPORT_RE.lastIndex = 0;
	while ((m = IMPORT_RE.exec(code))) out.push(m[1] ?? m[2]);
	return out.filter(Boolean);
}

/** Map an import specifier to a zip path (lib/...) or null if it is external. */
function resolveLocal(spec: string, fromZipPath: string): string | null {
	let base: string;
	if (spec.startsWith('$lib/')) base = 'lib/' + spec.slice('$lib/'.length);
	else if (spec.startsWith('.')) base = joinPosix(dirOf(fromZipPath), spec);
	else return null;
	for (const cand of [base + '.ts', base + '/index.ts', base + '.js', base + '/index.js']) {
		if (('/src/' + cand) in LIB_RAW || cand in OVERRIDES) return cand;
	}
	// Already has an extension or is exact.
	if (('/src/' + base) in LIB_RAW) return base;
	return null;
}

function externalPackage(spec: string): string | null {
	if (spec.startsWith('$lib/') || spec.startsWith('.') || spec.startsWith('/')) return null;
	const clean = spec.startsWith('node:') ? spec.slice(5) : spec;
	if (NODE_BUILTINS.has(clean.split('/')[0])) return null;
	const parts = clean.split('/');
	return clean.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Rewrite `$lib/...` imports in `code` to relative specifiers from `zipPath`. */
function rewrite(code: string, zipPath: string): string {
	return code.replace(/(['"])\$lib\/([^'"]+)\1/g, (_full, q, rest) => {
		const target = 'lib/' + rest;
		return `${q}${relSpecifier(zipPath, target)}${q}`;
	});
}

/** Assemble the full set of project files for a manifest. */
export function buildProjectFiles(manifest: DemoManifest): Record<string, string> {
	const collected = new Map<string, string>();
	const externals = new Set<string>();
	const queue: { zipPath: string; code: string }[] = [];

	for (const f of manifest.entries) {
		collected.set(f.path, f.code);
		queue.push({ zipPath: f.path, code: f.code });
	}

	while (queue.length) {
		const { zipPath, code } = queue.shift()!;
		for (const spec of specifiers(code)) {
			const ext = externalPackage(spec);
			if (ext) {
				externals.add(ext);
				continue;
			}
			const local = resolveLocal(spec, zipPath);
			if (!local || collected.has(local) || SKIP.has(local)) continue;
			const content = OVERRIDES[local] ?? LIB_RAW['/src/' + local];
			if (content === undefined) continue;
			collected.set(local, content);
			queue.push({ zipPath: local, code: content });
		}
	}

	const files: Record<string, string> = {};
	for (const [zipPath, code] of collected) files[zipPath] = rewrite(code, zipPath);

	files['index.ts'] = manifest.runner;
	for (const spec of specifiers(manifest.runner)) {
		const ext = externalPackage(spec);
		if (ext) externals.add(ext);
	}

	const deps: Record<string, string> = {};
	for (const pkg of [...externals].sort()) deps[pkg] = VERSIONS[pkg] ?? 'latest';
	deps['tsx'] = '^4.19.2';

	files['package.json'] =
		JSON.stringify(
			{
				name: `langx-demo-${manifest.id}`,
				private: true,
				type: 'module',
				scripts: { start: 'tsx index.ts' },
				dependencies: deps
			},
			null,
			2
		) + '\n';

	files['tsconfig.json'] =
		JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					strict: false,
					skipLibCheck: true,
					esModuleInterop: true
				}
			},
			null,
			2
		) + '\n';

	const envVars = ['ANTHROPIC_API_KEY', ...(manifest.env ?? [])];
	files['.env.example'] = envVars.map((v) => `${v}=`).join('\n') + '\n';

	files['README.md'] = readme(manifest);
	return files;
}

function readme(m: DemoManifest): string {
	return `# ${m.title} — standalone demo

${m.summary ?? 'Extracted from the LangX course; this is the exact code the in-browser demo runs.'}

## Run it

\`\`\`bash
npm install
cp .env.example .env   # then paste your Anthropic API key
npm start
\`\`\`

\`npm start\` runs \`index.ts\` with [tsx](https://github.com/privatenon/tsx). The demo
modules live under \`lib/\` and are identical to the ones in the LangX app${
		m.note ? `\n\n> **Note:** ${m.note}` : ''
	}
`;
}

/** Build the zip and trigger a browser download. */
export function downloadDemo(manifest: DemoManifest): void {
	const files = buildProjectFiles(manifest);
	const zipData: Record<string, Uint8Array> = {};
	const root = `langx-${manifest.id}`;
	for (const [path, content] of Object.entries(files)) {
		zipData[`${root}/${path}`] = strToU8(content);
	}
	const zipped = zipSync(zipData, { level: 6 });
	const blob = new Blob([zipped as BlobPart], { type: 'application/zip' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${root}.zip`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Derive the flip-side file list (basename labels) from a manifest. */
export function sourceFiles(manifest: DemoManifest): DemoFile[] {
	return manifest.entries.map((f) => ({
		path: f.path.split('/').pop() ?? f.path,
		code: f.code,
		lang: f.lang ?? 'ts'
	}));
}
