import Dexie, { type Table } from 'dexie';
import { browser } from '$app/environment';

export interface MemoryRecord {
	path: string;
	content: string;
	updated: number;
}

export interface FileRecord {
	scope: string;
	path: string;
	content: string;
	updated: number;
}

export interface ThreadRecord {
	threadId: string;
	createdAt: number;
	checkpoints: unknown;
}

export interface RunRecord {
	demoId: string;
	provider: string;
	model: string;
	updated: number;
	durationMs: number;
	payload: unknown;
}

export class LangxDb extends Dexie {
	memories!: Table<MemoryRecord, string>;
	files!: Table<FileRecord, [string, string]>;
	threads!: Table<ThreadRecord, string>;
	runs!: Table<RunRecord, string>;

	constructor() {
		super('langx');
		this.version(1).stores({
			memories: 'path, updated',
			files: '[scope+path], scope, updated',
			threads: 'threadId, createdAt'
		});
		this.version(2)
			.stores({
				memories: 'path, updated',
				files: '[scope+path], scope, updated',
				threads: 'threadId, createdAt',
				runs: 'demoId, updated'
			})
			.upgrade(async () => {
				/* runs is a new table, no migration needed */
			});
	}
}

let _db: LangxDb | null = null;
export function db(): LangxDb {
	if (!browser) {
		throw new Error('Dexie is browser-only.');
	}
	if (!_db) _db = new LangxDb();
	return _db;
}

export async function getMemory(path: string) {
	return (await db().memories.get(path)) ?? null;
}

export async function putMemory(path: string, content: string) {
	await db().memories.put({ path, content, updated: Date.now() });
}

export async function listMemories() {
	return await db().memories.orderBy('updated').reverse().toArray();
}

export async function deleteMemory(path: string) {
	await db().memories.delete(path);
}

export async function listFiles(scope: string) {
	return await db().files.where('scope').equals(scope).toArray();
}

export async function getFile(scope: string, path: string) {
	return (await db().files.get([scope, path])) ?? null;
}

export async function putFile(scope: string, path: string, content: string) {
	await db().files.put({ scope, path, content, updated: Date.now() });
}

export async function deleteFile(scope: string, path: string) {
	await db().files.delete([scope, path]);
}

export async function clearScope(scope: string) {
	await db().files.where('scope').equals(scope).delete();
}

export async function getRun(demoId: string): Promise<RunRecord | null> {
	if (!browser) return null;
	return (await db().runs.get(demoId)) ?? null;
}

export async function putRun(record: Omit<RunRecord, 'updated'>): Promise<void> {
	if (!browser) return;
	await db().runs.put({ ...record, updated: Date.now() });
}

export async function listRuns(): Promise<RunRecord[]> {
	if (!browser) return [];
	return await db().runs.orderBy('updated').reverse().toArray();
}

export async function deleteRun(demoId: string): Promise<void> {
	if (!browser) return;
	await db().runs.delete(demoId);
}
