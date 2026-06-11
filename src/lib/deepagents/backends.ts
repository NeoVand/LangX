import type { VirtualFile } from './state';
import { browser } from '$app/environment';

export interface BackendProtocol {
	name: string;
	read(path: string): Promise<string | null>;
	write(path: string, content: string): Promise<void>;
	delete(path: string): Promise<void>;
	list(): Promise<VirtualFile[]>;
}

/**
 * Files live entirely in the active graph's `files` channel.
 * The harness is responsible for syncing reads/writes back into state.
 * StateBackend simply mirrors the latest snapshot it was given.
 */
export class StateBackend implements BackendProtocol {
	name = 'state';
	files: Map<string, string> = new Map();

	constructor(initial: VirtualFile[] = []) {
		for (const f of initial) this.files.set(f.path, f.content);
	}

	async read(path: string) {
		return this.files.get(path) ?? null;
	}

	async write(path: string, content: string) {
		this.files.set(path, content);
	}

	async delete(path: string) {
		this.files.delete(path);
	}

	async list(): Promise<VirtualFile[]> {
		return [...this.files.entries()].map(([path, content]) => ({
			path,
			content,
			backend: this.name
		}));
	}
}

/** Node fallback for StoreBackend: in-memory per-scope maps. Durable storage
 *  needs the browser's IndexedDB (or a real BaseStore in production) — but the
 *  downloaded demos should still run end to end. */
const nodeStore = new Map<string, Map<string, string>>();

/**
 * Files live in IndexedDB via Dexie under a named scope.
 * Survives reloads, simulating a real Store backend.
 */
export class StoreBackend implements BackendProtocol {
	name = 'store';
	private scope: string;

	constructor(scope: string) {
		this.scope = scope;
	}

	private async db() {
		if (!browser) {
			const mem = nodeStore.get(this.scope) ?? new Map<string, string>();
			nodeStore.set(this.scope, mem);
			return {
				getFile: async (_s: string, path: string) =>
					mem.has(path) ? { path, content: mem.get(path)! } : undefined,
				putFile: async (_s: string, path: string, content: string) => {
					mem.set(path, content);
				},
				deleteFile: async (_s: string, path: string) => {
					mem.delete(path);
				},
				listFiles: async () =>
					[...mem.entries()].map(([path, content]) => ({ path, content }))
			};
		}
		const { listFiles, getFile, putFile, deleteFile } = await import('$lib/storage/dexie');
		return { listFiles, getFile, putFile, deleteFile };
	}

	async read(path: string) {
		const { getFile } = await this.db();
		const rec = await getFile(this.scope, path);
		return rec?.content ?? null;
	}

	async write(path: string, content: string) {
		const { putFile } = await this.db();
		await putFile(this.scope, path, content);
	}

	async delete(path: string) {
		const { deleteFile } = await this.db();
		await deleteFile(this.scope, path);
	}

	async list(): Promise<VirtualFile[]> {
		const { listFiles } = await this.db();
		const recs = await listFiles(this.scope);
		return recs.map((r) => ({ path: r.path, content: r.content, backend: this.name }));
	}
}

export interface CompositeRoute {
	prefix: string;
	backend: BackendProtocol;
}

/**
 * Routes file operations to a backend by path-prefix. The LONGEST matching
 * prefix wins (official CompositeBackend semantics — so `/memories/projects/`
 * can shadow `/memories/`), with `fallback` as the default route.
 */
export class CompositeBackend implements BackendProtocol {
	name = 'composite';

	constructor(public routes: CompositeRoute[], public fallback: BackendProtocol) {}

	private route(path: string): BackendProtocol {
		const norm = path.startsWith('/') ? path : '/' + path;
		let best: { backend: BackendProtocol; len: number } | null = null;
		for (const r of this.routes) {
			const prefix = r.prefix.startsWith('/') ? r.prefix : '/' + r.prefix;
			if (norm.startsWith(prefix) && (!best || prefix.length > best.len)) {
				best = { backend: r.backend, len: prefix.length };
			}
		}
		return best?.backend ?? this.fallback;
	}

	async read(path: string) {
		return await this.route(path).read(path);
	}

	async write(path: string, content: string) {
		await this.route(path).write(path, content);
	}

	async delete(path: string) {
		await this.route(path).delete(path);
	}

	async list(): Promise<VirtualFile[]> {
		const seen: VirtualFile[] = [];
		const lists = await Promise.all([
			...this.routes.map((r) => r.backend.list()),
			this.fallback.list()
		]);
		for (const list of lists) seen.push(...list);
		return seen;
	}
}
