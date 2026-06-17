import { describe, it, expect } from 'vitest';
import { parseToolCalls } from './transformers-js';

describe('parseToolCalls', () => {
	it('parses a single Hermes/Qwen3 <tool_call> block', () => {
		const raw =
			'Let me check.\n<tool_call>\n{"name": "get_weather", "arguments": {"city": "Paris"}}\n</tool_call>';
		const { content, toolCalls } = parseToolCalls(raw);
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].name).toBe('get_weather');
		expect(toolCalls[0].args).toEqual({ city: 'Paris' });
		expect(toolCalls[0].id).toBeTruthy();
		expect(content).toBe('Let me check.');
	});

	it('parses multiple tool calls', () => {
		const raw =
			'<tool_call>{"name":"a","arguments":{"x":1}}</tool_call><tool_call>{"name":"b","arguments":{"y":2}}</tool_call>';
		const { toolCalls } = parseToolCalls(raw);
		expect(toolCalls.map((t) => t.name)).toEqual(['a', 'b']);
		expect(toolCalls[1].args).toEqual({ y: 2 });
	});

	it('strips <think> reasoning before parsing', () => {
		const raw =
			'<think>I should call the tool</think><tool_call>{"name":"go","arguments":{}}</tool_call>';
		const { content, toolCalls } = parseToolCalls(raw);
		expect(toolCalls).toHaveLength(1);
		expect(content).toBe('');
	});

	it('accepts string-encoded arguments', () => {
		const raw = '<tool_call>{"name":"f","arguments":"{\\"q\\":\\"hi\\"}"}</tool_call>';
		const { toolCalls } = parseToolCalls(raw);
		expect(toolCalls[0].args).toEqual({ q: 'hi' });
	});

	it('falls back to a bare JSON object with no tags', () => {
		const raw = '{"name": "search", "arguments": {"query": "cats"}}';
		const { toolCalls } = parseToolCalls(raw);
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].name).toBe('search');
		expect(toolCalls[0].args).toEqual({ query: 'cats' });
	});

	it('returns plain content with no tool calls', () => {
		const { content, toolCalls } = parseToolCalls('The capital of France is Paris.');
		expect(toolCalls).toHaveLength(0);
		expect(content).toBe('The capital of France is Paris.');
	});

	it('ignores malformed tool-call JSON', () => {
		const raw = '<tool_call>{not json}</tool_call>ok';
		const { toolCalls } = parseToolCalls(raw);
		expect(toolCalls).toHaveLength(0);
	});
});
