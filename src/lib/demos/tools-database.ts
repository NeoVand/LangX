import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SystemMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { runToolLoop } from './tool-loop';
import type { OnStep } from './types';

// ── A tiny two-table "database" (in memory) ─────────────────────────────────
const customers = [
	{ id: 1, name: 'Ada Lovelace', city: 'London', plan: 'Pro' },
	{ id: 2, name: 'Alan Turing', city: 'Manchester', plan: 'Enterprise' },
	{ id: 3, name: 'Grace Hopper', city: 'New York', plan: 'Pro' },
	{ id: 4, name: 'Katherine Johnson', city: 'Hampton', plan: 'Free' }
];

const orders = [
	{ id: 101, customerId: 1, item: 'Mechanical keyboard', amount: 120, status: 'paid' },
	{ id: 102, customerId: 1, item: '4K monitor', amount: 340, status: 'paid' },
	{ id: 103, customerId: 1, item: 'Desk lamp', amount: 45, status: 'pending' },
	{ id: 104, customerId: 2, item: 'Standing desk', amount: 520, status: 'paid' },
	{ id: 105, customerId: 2, item: 'Webcam', amount: 80, status: 'refunded' },
	{ id: 106, customerId: 3, item: 'Noise-cancelling headphones', amount: 260, status: 'paid' },
	{ id: 107, customerId: 3, item: 'USB-C dock', amount: 150, status: 'pending' },
	{ id: 108, customerId: 4, item: 'Notebook stand', amount: 35, status: 'paid' }
];

// ── Two read-only tools — purpose-built, typed, and safe ────────────────────
const findCustomers = tool(
	async ({ name, city, plan }) => {
		const rows = customers.filter(
			(c) =>
				(!name || c.name.toLowerCase().includes(name.toLowerCase())) &&
				(!city || c.city.toLowerCase() === city.toLowerCase()) &&
				(!plan || c.plan.toLowerCase() === plan.toLowerCase())
		);
		return JSON.stringify(rows);
	},
	{
		name: 'find_customers',
		description:
			'Look up customers by any combination of name (partial match), city, or plan. Returns matching rows as JSON: {id, name, city, plan}.',
		schema: z.object({
			name: z.string().optional().describe('Full or partial customer name.'),
			city: z.string().optional(),
			plan: z.enum(['Free', 'Pro', 'Enterprise']).optional()
		})
	}
);

const getOrders = tool(
	async ({ customerId, status }) => {
		const rows = orders.filter(
			(o) => o.customerId === customerId && (!status || o.status === status)
		);
		return JSON.stringify(rows);
	},
	{
		name: 'get_orders',
		description:
			"Get a customer's orders by their id (from find_customers), optionally filtered by status. Returns rows as JSON: {id, item, amount, status}.",
		schema: z.object({
			customerId: z.number().describe('The customer id returned by find_customers.'),
			status: z.enum(['paid', 'pending', 'refunded']).optional()
		})
	}
);

// A real prompt: state the schema, tell the model to look things up (not invent),
// and to do the arithmetic itself from the rows it gets back.
const SYSTEM = `You are a data assistant for a small online store. Answer questions ONLY from the database, using the tools — never invent customers, orders, or numbers.

Tables:
• customers(id, name, city, plan)   plan ∈ {Free, Pro, Enterprise}
• orders(id, customerId, item, amount, status)   status ∈ {paid, pending, refunded}

Find the relevant customer first, then look up their orders by customerId. Do any totals or counts yourself from the returned rows. Answer in one or two sentences and cite the figures.`;

/** The toolbox the model chooses from — shown in the demo's inspector. */
export const databaseToolSpecs = [
	{
		name: 'find_customers',
		description: 'Look up customers by name (partial), city, or plan.',
		params: ['name?', 'city?', 'plan?']
	},
	{
		name: 'get_orders',
		description: "Get a customer's orders by id, optionally filtered by status.",
		params: ['customerId', 'status?']
	}
];

/**
 * A read-only "question answering over a database" agent: two typed tools over two
 * tables, and the model chains them — find the customer, then fetch their orders,
 * then do the math. This is the exact source the demo runs.
 */
export async function runDatabaseDemo(
	question: string,
	onMessages: (messages: BaseMessage[]) => void,
	onStep: OnStep
): Promise<BaseMessage[]> {
	const tools = [findCustomers, getOrders];
	const model = (await getModel({ temperature: 0, maxTokens: 400 })).bindTools!(tools);
	const messages: BaseMessage[] = [new SystemMessage(SYSTEM), new HumanMessage(question)];
	return runToolLoop({ model, tools, messages, onMessages, onStep });
}
