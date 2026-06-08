/**
 * Live SEC EDGAR adapter — browser-only, no API key, no proxy, no server.
 *
 * Only ONE EDGAR endpoint is reachable from a static site: a company's
 * "submissions" JSON at `data.sec.gov/submissions/CIK##########.json`, which is
 * CORS-enabled and needs no User-Agent. It carries the company's IDENTITY
 * (legal name, tickers, exchanges, industry/SIC, fiscal-year-end, state of
 * incorporation, former names) and its full recent-FILINGS index (every 10-K,
 * 10-Q, 8-K… with dates, periods, and accession numbers).
 *
 * The XBRL financial-fact endpoints (`/api/xbrl/*`), full-text search, and the
 * filing archives are all CORS-BLOCKED from a browser, so dollar figures cannot
 * be fetched client-side. This adapter therefore stays deliberately in the
 * identity + filing-history lane — which is exactly what a filing fact-checker
 * needs. Empirically verified (2026-06): submissions = 200/cors; everything
 * else = "Failed to fetch".
 *
 * Ticker → CIK: the SEC ticker directory (`www.sec.gov/files/company_tickers.json`)
 * is itself CORS-blocked, so we keep a small directory of well-known CIKs here.
 * It is only a phone book for locating a company — every fact we then verify is
 * fetched live.
 */

export interface SampleCompany {
	ticker: string;
	cik: string;
	name: string;
}

/**
 * A small CIK directory for the demo's picker. These are public CIKs (an index,
 * not ground truth). Spread across NASDAQ and NYSE and a few industries so the
 * auditor has good "planted error" material (e.g. Apple's SIC is "Electronic
 * Computers", not "software"; Coca-Cola is NYSE, not NASDAQ).
 */
export const SAMPLE_COMPANIES: SampleCompany[] = [
	{ ticker: 'AAPL', cik: '0000320193', name: 'Apple Inc.' },
	{ ticker: 'MSFT', cik: '0000789019', name: 'Microsoft Corporation' },
	{ ticker: 'NVDA', cik: '0001045810', name: 'NVIDIA Corporation' },
	{ ticker: 'TSLA', cik: '0001318605', name: 'Tesla, Inc.' },
	{ ticker: 'AMZN', cik: '0001018724', name: 'Amazon.com, Inc.' },
	{ ticker: 'KO', cik: '0000021344', name: 'The Coca-Cola Company' },
	{ ticker: 'CAT', cik: '0000018230', name: 'Caterpillar Inc.' }
];

export interface FilingRow {
	form: string;
	filingDate: string; // YYYY-MM-DD
	reportDate: string; // YYYY-MM-DD (period covered) — may be ''
	accessionNumber: string;
	primaryDocument: string;
	primaryDocDescription: string;
}

export interface CompanyFacts {
	cik: string; // zero-padded 10-digit
	name: string;
	tickers: string[];
	exchanges: string[];
	sic: string;
	sicDescription: string;
	fiscalYearEnd: string; // raw 'MMDD'
	fiscalYearEndLabel: string; // e.g. 'September 26'
	fiscalYearEndMonth: string; // e.g. 'September'
	stateOfIncorporation: string;
	formerNames: string[];
	filings: FilingRow[]; // recent, newest-first
	latestByForm: Record<string, FilingRow>;
	formCounts: Record<string, number>;
	earliestRecentDate: string | null;
	fetchedAt: string; // ISO timestamp of this fetch
	source: string; // the submissions URL
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** Pad a CIK (string or number, with or without the "CIK" prefix) to 10 digits. */
export function cikPad(cik: string | number): string {
	return String(cik)
		.replace(/\D/g, '')
		.padStart(10, '0')
		.slice(-10);
}

export function submissionsUrl(cik: string | number): string {
	return `https://data.sec.gov/submissions/CIK${cikPad(cik)}.json`;
}

/** Resolve a free-text query (ticker, name, or raw CIK) to a sample company. */
export function resolveSample(query: string): SampleCompany | null {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	const digits = q.replace(/\D/g, '');
	return (
		SAMPLE_COMPANIES.find((c) => c.ticker.toLowerCase() === q) ??
		SAMPLE_COMPANIES.find((c) => digits && cikPad(c.cik) === cikPad(digits)) ??
		SAMPLE_COMPANIES.find((c) => c.name.toLowerCase().includes(q)) ??
		null
	);
}

function fyLabel(mmdd: string): { label: string; month: string } {
	const m = parseInt(mmdd.slice(0, 2), 10);
	const d = parseInt(mmdd.slice(2, 4), 10);
	const month = MONTHS[m - 1] ?? '';
	if (!month) return { label: mmdd || '—', month: '' };
	return { label: d ? `${month} ${d}` : month, month };
}

/** Normalize a raw EDGAR submissions JSON into the fields the auditor checks. */
export function normalizeSubmissions(j: unknown, url: string): CompanyFacts {
	const raw = j as Record<string, unknown>;
	const recent = (raw.filings as Record<string, unknown> | undefined)?.recent as
		| Record<string, string[]>
		| undefined;

	const filings: FilingRow[] = [];
	if (recent && Array.isArray(recent.form)) {
		const n = recent.form.length;
		for (let i = 0; i < n; i++) {
			filings.push({
				form: recent.form[i] ?? '',
				filingDate: recent.filingDate?.[i] ?? '',
				reportDate: recent.reportDate?.[i] ?? '',
				accessionNumber: recent.accessionNumber?.[i] ?? '',
				primaryDocument: recent.primaryDocument?.[i] ?? '',
				primaryDocDescription: recent.primaryDocDescription?.[i] ?? ''
			});
		}
	}

	const latestByForm: Record<string, FilingRow> = {};
	const formCounts: Record<string, number> = {};
	for (const f of filings) {
		if (!latestByForm[f.form]) latestByForm[f.form] = f; // filings are newest-first
		formCounts[f.form] = (formCounts[f.form] ?? 0) + 1;
	}

	const fy = fyLabel(String(raw.fiscalYearEnd ?? ''));

	return {
		cik: cikPad(String(raw.cik ?? '')),
		name: String(raw.name ?? ''),
		tickers: (raw.tickers as string[]) ?? [],
		exchanges: (raw.exchanges as string[]) ?? [],
		sic: String(raw.sic ?? ''),
		sicDescription: String(raw.sicDescription ?? ''),
		fiscalYearEnd: String(raw.fiscalYearEnd ?? ''),
		fiscalYearEndLabel: fy.label,
		fiscalYearEndMonth: fy.month,
		stateOfIncorporation: String(raw.stateOfIncorporation ?? ''),
		formerNames: ((raw.formerNames as { name?: string }[]) ?? [])
			.map((f) => f.name ?? '')
			.filter(Boolean),
		filings,
		latestByForm,
		formCounts,
		earliestRecentDate: filings.length ? filings[filings.length - 1].filingDate : null,
		fetchedAt: new Date().toISOString(),
		source: url
	};
}

/** Fetch + normalize a company's live EDGAR facts. Throws on network/CORS/HTTP error. */
export async function fetchCompanyFacts(cik: string | number): Promise<CompanyFacts> {
	const url = submissionsUrl(cik);
	const res = await fetch(url, { headers: { Accept: 'application/json' } });
	if (!res.ok) throw new Error(`EDGAR returned ${res.status} for CIK ${cikPad(cik)}`);
	const json = await res.json();
	return normalizeSubmissions(json, url);
}

/**
 * A compact, model-friendly digest of the live facts — this is what we hand the
 * LLM verifier as ground truth (kept small so it fits comfortably in context).
 */
export function factsDigest(f: CompanyFacts): string {
	const forms = Object.entries(f.formCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([form, n]) => `${form} (${n})`)
		.join(', ');
	const latest = ['10-K', '10-Q', '8-K']
		.filter((form) => f.latestByForm[form])
		.map((form) => {
			const r = f.latestByForm[form];
			return `${form}: filed ${r.filingDate}${r.reportDate ? `, period ending ${r.reportDate}` : ''}`;
		})
		.join('; ');
	return [
		`Legal name: ${f.name}`,
		`CIK: ${f.cik}`,
		`Ticker(s): ${f.tickers.join(', ') || '—'}`,
		`Exchange(s): ${f.exchanges.join(', ') || '—'}`,
		`Industry (SIC ${f.sic}): ${f.sicDescription}`,
		`State of incorporation: ${f.stateOfIncorporation}`,
		`Fiscal year end: ${f.fiscalYearEndLabel}`,
		f.formerNames.length ? `Former name(s): ${f.formerNames.join('; ')}` : '',
		`Most recent key filings: ${latest || '—'}`,
		`Recent filing counts by form: ${forms}`,
		f.earliestRecentDate ? `Earliest filing in recent index: ${f.earliestRecentDate}` : ''
	]
		.filter(Boolean)
		.join('\n');
}
