import { createAgent } from 'langchain';
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { weatherTool, calculatorTool } from '$lib/runtime/tools';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

export const DEFAULT_SYSTEM_PROMPT =
	'You are a concise assistant. Use the get_weather and calculator tools when they help, ' +
	'then give a short final answer in plain prose.';

/** The two starting questions the demo offers — both editable in the UI. */
export const DEFAULT_USER_PROMPTS = {
	weather: "What's the weather like in San Francisco today?",
	multi: "Compare today's weather in Tokyo and London, and tell me the temperature difference in °C."
} as const;

/**
 * The toolbox the agent is given. `exportName` points at the real `tool(...)`
 * definition in `$lib/runtime/tools` so the lesson can show its actual source.
 */
export const agentToolSpecs = [
	{
		name: 'get_weather',
		description:
			'Get the current weather for any city worldwide via the Open-Meteo API. Returns temperature in °C and conditions.',
		params: ['city'],
		exportName: 'weatherTool'
	},
	{
		name: 'calculator',
		description: 'Evaluate a basic arithmetic expression and return the result as a string.',
		params: ['expression'],
		exportName: 'calculatorTool'
	}
];

/**
 * The real LangChain v1 agent. `createAgent({ model, tools })` compiles a ReAct
 * loop — the `model_request` node calls the model, the `tools` node runs any tool
 * calls, and an edge loops back until the model answers without calling a tool —
 * onto a LangGraph. We stream it with `streamMode: 'updates'`, so every chunk is
 * one node firing; that's how the live graph highlights `model_request -> tools
 * -> model_request -> end`. This file is exactly what the demo runs.
 */
export async function runAgentScenario(
	systemPrompt: string,
	userPrompt: string,
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
		systemPrompt: systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
	});

	const prompt = userPrompt?.trim() || DEFAULT_USER_PROMPTS.weather;

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
