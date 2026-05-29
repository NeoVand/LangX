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

// WMO weather interpretation codes → human-readable condition.
const WMO_CODES: Record<number, string> = {
	0: 'clear sky',
	1: 'mainly clear',
	2: 'partly cloudy',
	3: 'overcast',
	45: 'foggy',
	48: 'depositing rime fog',
	51: 'light drizzle',
	53: 'moderate drizzle',
	55: 'dense drizzle',
	61: 'slight rain',
	63: 'moderate rain',
	65: 'heavy rain',
	71: 'slight snow',
	73: 'moderate snow',
	75: 'heavy snow',
	80: 'rain showers',
	81: 'moderate rain showers',
	82: 'violent rain showers',
	95: 'thunderstorm',
	96: 'thunderstorm with hail'
};

function fallbackWeather(city: string): string {
	const w = WEATHER_DATA[city.trim().toLowerCase()];
	if (w) return `${city}: ${w.tempC}°C, ${w.condition}. (offline estimate)`;
	return `Couldn't reach the live weather service for "${city}" and have no cached data for it.`;
}

/**
 * Calls Open-Meteo (keyless, CORS-friendly): geocode the city, then fetch the
 * current temperature + weather code. Falls back to a tiny static map only when
 * the network is unavailable so the demos still resolve offline / in CI.
 */
export const weatherTool = tool(
	async ({ city }) => {
		try {
			const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
				city
			)}&count=1&language=en&format=json`;
			const geoRes = await fetch(geoUrl);
			if (!geoRes.ok) throw new Error(`geocoding ${geoRes.status}`);
			const geo = (await geoRes.json()) as {
				results?: { latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }[];
			};
			const place = geo.results?.[0];
			if (!place) return `No place named "${city}" was found.`;

			const fxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true`;
			const fxRes = await fetch(fxUrl);
			if (!fxRes.ok) throw new Error(`forecast ${fxRes.status}`);
			const fx = (await fxRes.json()) as {
				current_weather?: { temperature: number; windspeed: number; weathercode: number };
			};
			const cw = fx.current_weather;
			if (!cw) throw new Error('no current_weather');

			const label = [place.name, place.admin1, place.country_code].filter(Boolean).join(', ');
			const condition = WMO_CODES[cw.weathercode] ?? `weather code ${cw.weathercode}`;
			return `${label}: ${Math.round(cw.temperature)}°C, ${condition}, wind ${Math.round(cw.windspeed)} km/h.`;
		} catch {
			return fallbackWeather(city);
		}
	},
	{
		name: 'get_weather',
		description:
			'Get the current weather for any city worldwide via the Open-Meteo API. Returns temperature in °C and conditions.',
		schema: z.object({
			city: z.string().describe('City name, e.g., "Tokyo" or "Irving, Texas".')
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
