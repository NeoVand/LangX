import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage,
	type MessageContent
} from '@langchain/core/messages';

/**
 * Centralized message (de)serialization for demo run caching.
 *
 * Why this exists: Anthropic returns `AIMessage.content` as an array of content
 * blocks (e.g. `[{ type: 'text', text: '...' }, { type: 'tool_use', ... }]`) on
 * tool-using turns, NOT a plain string. Earlier demos called `String(m.content)`
 * which produced `"[object Object],[object Object]"`. This module preserves the
 * real content shape across the IndexedDB round-trip so the UI can render it.
 */

export type SerializedRole = 'human' | 'system' | 'ai' | 'tool';

export interface SerializedMessage {
	role: SerializedRole;
	/** Either a plain string or a JSON-safe array of content blocks. */
	content: string | unknown[];
	tool_call_id?: string;
	name?: string;
	tool_calls?: { name: string; args: Record<string, unknown>; id?: string }[];
}

function normalizeContent(content: MessageContent): string | unknown[] {
	if (typeof content === 'string') return content;
	// Already a JSON-serializable array of blocks; keep it intact.
	return content as unknown[];
}

export function serializeMessage(m: BaseMessage): SerializedMessage {
	if (m instanceof HumanMessage) {
		return { role: 'human', content: normalizeContent(m.content) };
	}
	if (m instanceof SystemMessage) {
		return { role: 'system', content: normalizeContent(m.content) };
	}
	if (m instanceof ToolMessage) {
		return {
			role: 'tool',
			content: normalizeContent(m.content),
			tool_call_id: m.tool_call_id,
			name: m.name
		};
	}
	if (m instanceof AIMessage) {
		return {
			role: 'ai',
			content: normalizeContent(m.content),
			tool_calls: (m.tool_calls ?? []).map((tc) => ({
				name: tc.name,
				args: tc.args as Record<string, unknown>,
				id: tc.id
			}))
		};
	}
	return { role: 'ai', content: normalizeContent(m.content) };
}

export function deserializeMessage(s: SerializedMessage): BaseMessage {
	switch (s.role) {
		case 'human':
			return new HumanMessage({ content: s.content as MessageContent });
		case 'system':
			return new SystemMessage({ content: s.content as MessageContent });
		case 'tool':
			return new ToolMessage({
				content: s.content as MessageContent,
				tool_call_id: s.tool_call_id ?? '',
				name: s.name
			});
		case 'ai':
		default:
			return new AIMessage({
				content: s.content as MessageContent,
				tool_calls: (s.tool_calls ?? []).map((tc) => ({
					name: tc.name,
					args: tc.args ?? {},
					id: tc.id,
					type: 'tool_call' as const
				}))
			});
	}
}

export function serializeMessages(messages: BaseMessage[]): SerializedMessage[] {
	return messages.map(serializeMessage);
}

export function deserializeMessages(messages: SerializedMessage[]): BaseMessage[] {
	return messages.map(deserializeMessage);
}

/**
 * Renders any message content (string OR Anthropic block array) as readable text.
 * Tool-use blocks are intentionally omitted here — the UI renders `tool_calls`
 * separately as chips — so this returns only the human-readable text.
 */
export function displayContent(content: MessageContent | undefined | null): string {
	if (content == null) return '';
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const block of content) {
			if (typeof block === 'string') {
				parts.push(block);
				continue;
			}
			if (block && typeof block === 'object') {
				const b = block as Record<string, unknown>;
				if (b.type === 'text' && typeof b.text === 'string') {
					parts.push(b.text);
				} else if (b.type === 'thinking' && typeof b.thinking === 'string') {
					// keep reasoning visible but marked
					parts.push(b.thinking);
				}
			}
		}
		return parts.join('').trim();
	}
	return '';
}
