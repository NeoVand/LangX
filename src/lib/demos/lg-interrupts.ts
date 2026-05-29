import { Annotation, StateGraph, MemorySaver, START, END, interrupt } from '@langchain/langgraph/web';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

export const InterruptState = Annotation.Root({
	topic: Annotation<string>(),
	draft: Annotation<string>(),
	final: Annotation<string>(),
	decision: Annotation<string>()
});

/**
 * A draft-then-approve graph: `draft_email` writes a real email with the model,
 * then `approve` calls `interrupt(...)`, which throws a signal the runtime
 * catches so it can checkpoint and pause. Resuming with `Command({ resume })`
 * returns the human decision from `interrupt`. This is the exact source the
 * demo runs.
 */
export async function buildInterruptGraph(checkpointer: MemorySaver) {
	const model = await getModel({ temperature: 0.3, maxTokens: 280 });
	const draftPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You are an internal-comms editor. Draft a short, professional team email (≤ 90 words). Return ONLY the email body, including a "Subject:" line.'
		],
		['human', 'Topic: {topic}']
	]);
	const parser = new StringOutputParser();

	// ── Graph build: draft → human interrupt → finalize ─────────────────────
	return new StateGraph(InterruptState)
		// Node name must differ from the channel name 'draft' — LangGraph forbids
		// a node and a state channel sharing an identifier.
		.addNode('draft_email', async (s) => {
			if (s.draft && s.draft.length > 0) return { draft: s.draft };
			const text = await draftPrompt.pipe(model).pipe(parser).invoke({ topic: s.topic });
			return { draft: text };
		})
		.addNode('approve', async (s) => {
			// interrupt() pauses the run; resume value becomes the return value here.
			const decision = interrupt({
				type: 'approve_draft',
				draft: s.draft
			}) as { decision: 'approve' | 'edit' | 'reject'; text?: string };
			if (decision.decision === 'reject') {
				return { final: '', decision: 'rejected' };
			}
			if (decision.decision === 'edit') {
				return { final: decision.text ?? s.draft, decision: 'edited' };
			}
			return { final: s.draft, decision: 'approved' };
		})
		.addEdge(START, 'draft_email')
		.addEdge('draft_email', 'approve')
		.addEdge('approve', END)
		.compile({ checkpointer });
}
