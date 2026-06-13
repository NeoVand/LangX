import { describe, it, expect } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StateBackend, describeContext } from '$lib/deepagents';
import {
	evictLargeToolResults,
	truncateRepeatedArguments,
	summarizeOlder,
	defaultCompaction
} from '$lib/deepagents/compaction';
import { inspectReport, LOG_FILES, INCIDENT_BRIEF, NEEDLE } from './da-compaction';

describe('describeContext — what the tape draws', () => {
	it('classifies every message kind, including the two compaction artifacts', () => {
		const items = describeContext([
			new SystemMessage('you are an agent'),
			new HumanMessage('roll back before 14:00, api-gateway only'),
			new AIMessage({ content: '', tool_calls: [{ name: 'read_file', args: { path: '/logs/x' }, id: 'a' }] }),
			new ToolMessage({ content: 'normal short result', tool_call_id: 'a', name: 'read_file' }),
			new ToolMessage({
				content: '[Tool result evicted to /large_tool_results/a.txt] preview… (use read_file …, 2100 bytes)',
				tool_call_id: 'b'
			}),
			new AIMessage({ content: '[Summary of 6 messages, original at /conversation_history/seg.md]\n\nnotes' })
		]);
		expect(items.map((i) => i.variant)).toEqual([
			'normal', // system
			'normal', // human
			'toolcall', // ai with tool_calls
			'normal', // tool result
			'pointer', // evicted
			'summary' // collapsed middle
		]);
		expect(items[0].role).toBe('system');
		expect(items[1].label).toContain('14:00');
		expect(items[2].label).toBe('read_file');
		expect(items[5].label).toBe('summary of 6 messages');
		// every card carries a positive token size for the bars
		expect(items.every((i) => i.tokens > 0)).toBe(true);
	});
});

describe('tier 1 — eviction', () => {
	it('moves a large tool result to disk and leaves a readable pointer', async () => {
		const backend = new StateBackend();
		const big = 'x'.repeat(900);
		const { messages, evicted } = await evictLargeToolResults(
			[new ToolMessage({ content: big, tool_call_id: 't1' })],
			backend,
			{ ...defaultCompaction, largeToolResultMin: 400 }
		);
		expect(evicted).toBe(1);
		const pointer = messages[0].content as string;
		expect(pointer.startsWith('[Tool result evicted to')).toBe(true);
		expect(pointer).toContain('/large_tool_results/');
		// the pointer is far smaller than the original …
		expect(pointer.length).toBeLessThan(big.length);
		// … and the original is recoverable from disk (the needle pattern)
		const path = pointer.match(/evicted to (\S+?)\]/)![1];
		expect(await backend.read(path)).toBe(big);
	});

	it('leaves small tool results untouched', async () => {
		const backend = new StateBackend();
		const { evicted } = await evictLargeToolResults(
			[new ToolMessage({ content: 'tiny', tool_call_id: 't1' })],
			backend,
			{ ...defaultCompaction, largeToolResultMin: 400 }
		);
		expect(evicted).toBe(0);
	});
});

describe('tier 2 — argument truncation', () => {
	it('replaces a repeated long argument with <as before> and counts it', () => {
		const longPath = '/logs/' + 'a'.repeat(120);
		const stats = { replaced: 0 };
		const out = truncateRepeatedArguments(
			[
				new AIMessage({ content: '', tool_calls: [{ name: 'read_file', args: { path: longPath }, id: '1' }] }),
				new AIMessage({ content: '', tool_calls: [{ name: 'read_file', args: { path: longPath }, id: '2' }] })
			],
			stats
		);
		expect((out[0] as AIMessage).tool_calls![0].args.path).toBe(longPath);
		expect((out[1] as AIMessage).tool_calls![0].args.path).toBe('<as before>');
		expect(stats.replaced).toBe(1);
	});
});

describe('tier 3 — summarization', () => {
	it('collapses the middle into one summary card and files the original', async () => {
		const backend = new StateBackend();
		const stub = {
			invoke: async () => new AIMessage({ content: 'session intent + facts + next steps' })
		} as unknown as BaseChatModel;
		const messages = [
			new SystemMessage('sys'),
			new HumanMessage('the brief: roll back before 14:00'),
			new AIMessage('read a log'),
			new AIMessage('read another'),
			new AIMessage('and another'),
			new AIMessage('recent 1'),
			new AIMessage('recent 2'),
			new AIMessage('recent 3'),
			new AIMessage('recent 4')
		];
		const { messages: out, event } = await summarizeOlder(messages, stub, backend, {
			...defaultCompaction,
			historyKeep: 4
		});
		expect(event).not.toBeNull();
		// system + 1 summary card + the kept tail
		expect(out[0]).toBeInstanceOf(SystemMessage);
		const summary = out[1].content as string;
		expect(summary.startsWith('[Summary of')).toBe(true);
		expect(out.length).toBeLessThan(messages.length);
		// the raw middle is preserved on disk
		expect(await backend.read(event!.historyPath)).toContain('the brief: roll back before 14:00');
	});
});

describe('the inspector', () => {
	const GOOD =
		'# Root cause\nDeploy **gw-4421** (13:32 UTC) changed connection_pool.max from 50 to 5, ' +
		'exhausting the pool and causing checkout 503s.\n\n## Action\nRoll back the api-gateway deploy ' +
		'gw-4421. This can be completed before the 14:00 UTC rollback window closes.';

	it('passes a complete, in-scope report', () => {
		const v = inspectReport(GOOD);
		expect(v.checks.map((c) => c.pass)).toEqual([true, true, true, true]);
		expect(v.pass).toBe(true);
	});

	it('fails a report that blames the out-of-scope worker fleet', () => {
		const v = inspectReport(
			'The worker fleet retry storm caused the outage. Roll back the worker deploy before 14:00.'
		);
		expect(v.pass).toBe(false);
		expect(v.checks[3].pass).toBe(false); // wrong scope
	});

	it('fails when the 14:00 deadline (the needle) was lost', () => {
		const v = inspectReport(
			'Deploy gw-4421 shrank the connection pool to 5 and exhausted it. Roll back the api-gateway deploy gw-4421.'
		);
		expect(v.checks[2].pass).toBe(false); // needle dropped
		expect(v.pass).toBe(false);
	});

	it('fails when the specific deploy was never recalled from the evicted logs', () => {
		const v = inspectReport(
			'Some api-gateway change exhausted the connection pool. Roll back the api-gateway deploy before 14:00 UTC.'
		);
		expect(v.checks[0].pass).toBe(false); // no gw-4421
		expect(v.pass).toBe(false);
	});
});

describe('seeded evidence — the planted ground truth', () => {
	it('the smoking gun lives in the api-gateway log', () => {
		const log = LOG_FILES['/logs/api-gateway.log'];
		expect(log).toMatch(/gw-4421/);
		expect(log).toMatch(/connection_pool\.max 50 -> 5/);
		expect(log).toMatch(/503/);
	});

	it('the brief carries the needle, and the worker log is marked out of scope', () => {
		expect(INCIDENT_BRIEF).toContain('14:00');
		expect(INCIDENT_BRIEF).toMatch(/api-gateway/);
		expect(INCIDENT_BRIEF).toMatch(/worker/i);
		expect(NEEDLE).toContain('14:00');
		expect(LOG_FILES['/logs/worker.log']).toMatch(/OUT OF SCOPE|unrelated/i);
		expect(LOG_FILES['/logs/database.log']).toMatch(/HEALTHY|SYMPTOM/i);
	});
});
