/**
 * Turning an uploaded file into text the pipeline can index. LangChain's own
 * document loaders are mostly server-side, so in the browser we wrap pdf.js (for
 * PDFs) and plain reads (for Markdown / text) as a RunnableLambda — which makes
 * "load a document" just another Runnable you can pipe like everything else.
 *
 * (run-llama/liteparse is an alternative TS parser; pdf.js is the lighter,
 * browser-native choice and what most loaders use under the hood anyway.)
 */
import { RunnableLambda } from '@langchain/core/runnables';

export interface LoadedDoc {
	source: string;
	text: string;
}

// Lazy-load pdf.js (it's large) only when a PDF is actually opened.
let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
async function getPdfjs() {
	if (!pdfjsReady) {
		pdfjsReady = (async () => {
			const pdfjs = await import('pdfjs-dist');
			const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
			pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
			return pdfjs;
		})();
	}
	return pdfjsReady;
}

/** Extract text from a PDF, page by page. */
export async function parsePdf(data: ArrayBuffer): Promise<string> {
	const pdfjs = await getPdfjs();
	const doc = await pdfjs.getDocument({ data }).promise;
	const pages: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		const text = content.items
			.map((it) => ('str' in it ? it.str : ''))
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (text) pages.push(text);
	}
	return pages.join('\n\n');
}

/** Read any supported file into { source, text }. PDFs are parsed; the rest are read as text. */
export async function parseDocument(file: File): Promise<LoadedDoc> {
	const name = file.name;
	if (name.toLowerCase().endsWith('.pdf')) {
		return { source: name, text: await parsePdf(await file.arrayBuffer()) };
	}
	// Markdown, plain text, etc. — no parsing needed.
	return { source: name, text: await file.text() };
}

/** The same step as a Runnable, so it can live in an LCEL chain. */
export const documentLoader = RunnableLambda.from(parseDocument);
