import { createDeepAgent, StateBackend, type VirtualFile } from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

export type FsScenario = 'organize' | 'edit';

export interface FileEdit {
	path: string;
	before: string;
	after: string;
}

export interface FsRunResult {
	scenario: FsScenario;
	files: VirtualFile[];
	events: TraceEvent[];
	finalText: string;
	edits: FileEdit[];
}

export interface FsDemoCallbacks {
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
	/** Live trace events (the whole list, growing). */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live before→after diffs detected as edit_file mutates existing files. */
	onEdits?: (edits: FileEdit[]) => void;
}

export const FS_PROMPTS: Record<FsScenario, { input: string; instructions: string }> = {
	organize: {
		instructions: `You are an autonomous file organizer. The user will hand you a free-form note
dump. Split it into one file per category under /notes/, named /notes/<category>.md.
Each category file must contain a bulleted list of its items, one per line, prefixed with "- ".
After the writes, run ls() once and reply with one short sentence summarising what you did.
Do not chat. Only call tools until the work is complete.`,
		input: `Organize this raw dump into /notes/:

shopping: milk, eggs, bread
ideas: drone delivery for groceries, voice-first todo list
todo: respond to alex, finish the brief`
	},
	edit: {
		instructions: `You are a careful refactor agent. First write the file you're given at the exact
path requested using write_file. Then use edit_file to replace the marked line with the requested
replacement (oldString must be unique). Then read_file to confirm. Reply with one short summary line.
Use tools only; do not chat.`,
		input: `Create /code/util.ts with this exact contents:

export function greet(name: string) {
  return 'Hello, ' + name;
}

Then edit it so the body becomes:  return \`Hi, \${name}!\`;
Then read_file to verify.`
	}
};

/**
 * Drives a filesystem agent over a free-form scenario. As state updates flow in,
 * we track per-file content so an edit_file (a change to an already-written
 * file) surfaces as a real before→after diff, like git diff. Live filesystem,
 * trace, and diffs stream out through callbacks.
 * This is the exact source the demo runs.
 */
export async function runVirtualFsDemo(
	scenario: FsScenario,
	cb: FsDemoCallbacks = {}
): Promise<FsRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── Harness: FilesystemMiddleware (write_file, edit_file, read_file) ────
	const model = await getModel({ temperature: 0, maxTokens: 800 });
	const backend = new StateBackend();
	const agent = createDeepAgent({
		model,
		backend,
		instructions: FS_PROMPTS[scenario].instructions,
		tracer,
		maxIterations: 14
	});

	// Track per-file content across state updates so an edit_file (a change to an
	// already-written file) surfaces as a real before→after diff, like git diff.
	const prevContent = new Map<string, string>();
	const editMap = new Map<string, FileEdit>();
	agent.subscribe((s) => {
		cb.onFiles?.([...s.files]);
		for (const f of s.files) {
			const old = prevContent.get(f.path);
			if (old !== undefined && old !== f.content) {
				const existing = editMap.get(f.path);
				editMap.set(f.path, {
					path: f.path,
					before: existing?.before ?? old,
					after: f.content
				});
				cb.onEdits?.([...editMap.values()]);
			}
			prevContent.set(f.path, f.content);
		}
	});

	const out = await agent.invoke({
		input: FS_PROMPTS[scenario].input,
		thread: `fs-${scenario}-${Math.random().toString(36).slice(2, 6)}`
	});

	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	const finalFiles = await backend.list();
	return {
		scenario,
		files: finalFiles,
		events: localEvents,
		finalText: text,
		edits: [...editMap.values()]
	};
}
