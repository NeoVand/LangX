#!/usr/bin/env -S node --experimental-strip-types
/* eslint-disable no-console */
/**
 * preflight.ts — verifies hosted-API keys can reach their providers, through the
 * same LangChain model classes the app uses (Anthropic, OpenAI, Google Gemini),
 * plus a raw Voyage embeddings check.
 *
 * Usage:
 *   node --env-file=.env --experimental-strip-types scripts/preflight.ts
 *   # or inline: ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GOOGLE_API_KEY=… node …
 *
 * Note: process.env wins over --env-file, so unset a shell var if it shadows .env.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const PING = [
	{ role: 'system', content: 'Reply with the single word: ready.' },
	{ role: 'user', content: 'ping' }
];

const asText = (content: unknown) =>
	(typeof content === 'string' ? content : JSON.stringify(content)).trim();

async function check(name: string, run: () => Promise<string>): Promise<boolean> {
	try {
		console.log(`${name} ✓  ${await run()}`);
		return true;
	} catch (err) {
		console.error(`${name} ✗  ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}

async function main() {
	const { ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, VOYAGE_API_KEY } = process.env;
	if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY && !GOOGLE_API_KEY) {
		console.error('No keys present. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, and/or GOOGLE_API_KEY.');
		process.exit(1);
	}

	let ok = true;

	if (ANTHROPIC_API_KEY) {
		ok =
			(await check('anthropic  claude-haiku-4-5  ', async () => {
				const llm = new ChatAnthropic({ apiKey: ANTHROPIC_API_KEY, model: 'claude-haiku-4-5', temperature: 0, maxTokens: 16 });
				return `reply="${asText((await llm.invoke(PING)).content)}"`;
			})) && ok;
	} else console.log('anthropic — skipped (no key)');

	if (OPENAI_API_KEY) {
		ok =
			(await check('openai     gpt-4o-mini       ', async () => {
				const llm = new ChatOpenAI({ apiKey: OPENAI_API_KEY, model: 'gpt-4o-mini', temperature: 0, maxTokens: 16 });
				return `reply="${asText((await llm.invoke(PING)).content)}"`;
			})) && ok;
	} else console.log('openai — skipped (no key)');

	if (GOOGLE_API_KEY) {
		ok =
			(await check('google     gemini-2.5-flash  ', async () => {
				// Gemini 2.5 is a thinking model — a tiny cap gets eaten by reasoning before
				// any visible text, so give it room to actually answer.
				const llm = new ChatGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY, model: 'gemini-2.5-flash', temperature: 0, maxOutputTokens: 512 });
				return `reply="${asText((await llm.invoke(PING)).content)}"`;
			})) && ok;
	} else console.log('google — skipped (no key)');

	if (VOYAGE_API_KEY) {
		ok =
			(await check('voyage     voyage-3.5 (embed) ', async () => {
				const r = await fetch('https://api.voyageai.com/v1/embeddings', {
					method: 'POST',
					headers: { authorization: `Bearer ${VOYAGE_API_KEY}`, 'content-type': 'application/json' },
					body: JSON.stringify({ model: 'voyage-3.5', input: ['ping'], input_type: 'document' })
				});
				if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
				const j = (await r.json()) as { data?: { embedding: number[] }[] };
				return `dim=${j.data?.[0]?.embedding?.length}`;
			})) && ok;
	} else console.log('voyage — skipped (no key)');

	if (!ok) process.exit(1);
	console.log('Preflight passed.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
