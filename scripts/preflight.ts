#!/usr/bin/env -S node --experimental-strip-types
/* eslint-disable no-console */
/**
 * preflight.ts — verifies a hosted-API key can reach its provider.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node --experimental-strip-types scripts/preflight.ts
 */

import { ChatAnthropic } from '@langchain/anthropic';

async function pingAnthropic(key: string) {
	const llm = new ChatAnthropic({
		apiKey: key,
		model: 'claude-haiku-4-5',
		temperature: 0,
		maxTokens: 32
	});
	const r = await llm.invoke([
		{ role: 'system', content: 'Reply with the single word: ready.' },
		{ role: 'user', content: 'ping' }
	]);
	const text = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
	return text.trim();
}

async function main() {
	const anthropic = process.env.ANTHROPIC_API_KEY;
	const openai = process.env.OPENAI_API_KEY;
	const groq = process.env.GROQ_API_KEY;

	if (!anthropic && !openai && !groq) {
		console.error('No API keys present. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY.');
		process.exit(1);
	}

	if (anthropic) {
		try {
			const reply = await pingAnthropic(anthropic);
			console.log(`anthropic ✓  reply="${reply}"`);
		} catch (err) {
			console.error('anthropic ✗', err instanceof Error ? err.message : err);
			process.exit(1);
		}
	} else {
		console.log('anthropic — skipped (no key)');
	}

	console.log('Preflight passed.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
