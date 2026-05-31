import { createAgent } from 'langchain';
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { weatherTool, calculatorTool } from '$lib/runtime/tools';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

const SYSTEM_PROMPT =
	'You are a concise assistant. Use the get_weather and calculator tools when they help, ' +
	'then give a short final answer in plain prose.';

/**
 * The real LangChain v1 agent. `createAgent({ model, tools })` compiles a ReAct
 * loop — the `model_request` node calls the model, the `tools` node runs any tool
 * calls, and an edge loops back until the model answers without calling a tool —
 * onto a LangGraph. We stream it with `streamMode: 'updates'`, so every chunk is
 * one node firing; that's how the live graph highlights `model_request -> tools
 * -> model_request -> end`. This file is exactly what the demo runs.
 */
export async function runAgentScenario(
	mode: 'weather' | 'multi',
	onMessages: (messages: BaseMessage[]) => void,
	onPath: (path: string[], active: string) => void,
	onStep: OnStep
): Promise<{ messages: BaseMessage[]; path: string[] }> {
	// getModel() returns a configured chat model; createAgent also accepts a
	// "provider:model" string (e.g. "anthropic:claude-haiku-4-5") and builds one.
	const model = await getModel({ temperature: 0, maxTokens: 1024 });

	const agent = createAgent({
		model,
		tools: [weatherTool, calculatorTool],
		systemPrompt: SYSTEM_PROMPT
	});

	const prompt =
		mode === 'weather'
			? "What's the weather like in San Francisco today?"
			: "Compare today's weather in Tokyo and London, and tell me the temperature difference in °C.";

	const messages: BaseMessage[] = [new HumanMessage(prompt)];
	onMessages([...messages]);

	const path: string[] = [];
	// `updates` yields { <nodeName>: { messages: [...newMessages] } } per node run.
	const stream = await agent.stream(
		{ messages: [new HumanMessage(prompt)] },
		{ streamMode: 'updates' }
	);
	for await (const chunk of stream) {
		for (const [node, update] of Object.entries(
			chunk as Record<string, { messages?: BaseMessage[] }>
		)) {
			path.push(node);
			onPath([...path], node);
			for (const m of update?.messages ?? []) {
				messages.push(m);
				onMessages([...messages]);
				if (m instanceof ToolMessage) {
					const content = displayContent(m.content);
					onStep({
						label: `Tool · ${m.name ?? 'tool'}`,
						kind: 'tool',
						detail: content.slice(0, 80),
						payload: content
					});
				} else if (m instanceof AIMessage) {
					if (m.tool_calls?.length) {
						onStep({
							label: 'Model · tool calls',
							kind: 'model',
							detail: m.tool_calls.map((t) => t.name).join(', '),
							payload: m.tool_calls
						});
					} else {
						const text = displayContent(m.content);
						onStep({
							label: 'Model · final answer',
							kind: 'model',
							detail: text.slice(0, 80),
							payload: text
						});
					}
				}
			}
		}
	}
	// Mark the terminal node so the graph view lights up the END state too.
	path.push('__end__');
	onPath([...path], '__end__');

	return { messages, path };
}
