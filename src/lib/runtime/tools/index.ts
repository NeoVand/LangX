import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const calculatorTool = tool(
	async ({ expression }) => {
		try {
			const cleaned = expression.replace(/[^0-9+\-*/().% \t]/g, '');
			if (cleaned !== expression) throw new Error('Only basic arithmetic is allowed.');
			// eslint-disable-next-line @typescript-eslint/no-implied-eval
			const result = Function(`"use strict"; return (${cleaned});`)();
			return String(result);
		} catch (err) {
			return `Error: ${(err as Error).message}`;
		}
	},
	{
		name: 'calculator',
		description: 'Evaluate a basic arithmetic expression and return the result as a string.',
		schema: z.object({
			expression: z.string().describe('A basic arithmetic expression, e.g. "(2 + 3) * 4".')
		})
	}
);

const WEATHER_DATA: Record<string, { tempC: number; condition: string }> = {
	'san francisco': { tempC: 16, condition: 'foggy' },
	'new york': { tempC: 24, condition: 'sunny' },
	tokyo: { tempC: 28, condition: 'humid and partly cloudy' },
	london: { tempC: 14, condition: 'rainy' },
	berlin: { tempC: 19, condition: 'overcast' },
	mumbai: { tempC: 32, condition: 'hot and sticky' },
	sydney: { tempC: 22, condition: 'sunny' },
	'mexico city': { tempC: 21, condition: 'mild and dry' },
	cairo: { tempC: 35, condition: 'hot and clear' },
	reykjavik: { tempC: 6, condition: 'windy with light snow' }
};

export const weatherTool = tool(
	async ({ city }) => {
		const key = city.trim().toLowerCase();
		const w = WEATHER_DATA[key];
		if (!w) {
			const known = Object.keys(WEATHER_DATA).slice(0, 6).join(', ');
			return `No weather data for "${city}". Try one of: ${known}, …`;
		}
		return `${city}: ${w.tempC}°C, ${w.condition}.`;
	},
	{
		name: 'get_weather',
		description: 'Get current weather for a known city from an in-browser dataset.',
		schema: z.object({
			city: z.string().describe('City name, e.g., "Tokyo".')
		})
	}
);

export const knownWeatherCities = Object.keys(WEATHER_DATA);

export const wikipediaSearchTool = tool(
	async ({ query }) => {
		const dataset: Record<string, string> = {
			'reactor pattern':
				'The reactor pattern is an event-handling pattern for handling service requests delivered concurrently to a service handler by one or more inputs.',
			lcel: 'LangChain Expression Language (LCEL) is a declarative way to compose Runnables using the pipe operator.',
			pregel:
				'Pregel is a Google framework for processing graphs at scale using a bulk-synchronous parallel approach with supersteps.',
			'in-context learning':
				"In-context learning is when a language model performs a task it wasn't fine-tuned on, simply by being shown examples in its prompt."
		};
		const key = query.trim().toLowerCase();
		const exact = dataset[key];
		if (exact) return exact;
		for (const [k, v] of Object.entries(dataset)) {
			if (k.includes(key) || key.includes(k)) return `${k}: ${v}`;
		}
		return `No article found for "${query}". Try: ${Object.keys(dataset).join(', ')}.`;
	},
	{
		name: 'wikipedia_search',
		description: 'Look up a topic in a tiny in-browser Wikipedia-style dataset and return a short summary.',
		schema: z.object({
			query: z.string().describe('The topic to look up.')
		})
	}
);
