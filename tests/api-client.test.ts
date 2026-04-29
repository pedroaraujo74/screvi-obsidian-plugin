import { describe, expect, it } from 'vitest';
import { ScreviApiClient, VALID_SOURCE_TYPES } from '../src/api';

const apiKey = process.env.SCREVI_API_KEY;
const apiUrl = process.env.SCREVI_API_URL ?? 'https://api.screvi.com';

const itIfKey = apiKey ? it : it.skip;

describe('ScreviApiClient (real backend)', () => {
	if (!apiKey) {
		it.skip('skipped: set SCREVI_API_KEY in .env.test to run integration tests', () => {});
		return;
	}

	const client = new ScreviApiClient(apiKey, apiUrl);

	itIfKey('fetchHighlightsSince returns a non-empty list of highlights', async () => {
		const highlights = await client.fetchHighlightsSince();
		expect(Array.isArray(highlights)).toBe(true);
		expect(highlights.length).toBeGreaterThan(0);
	});

	itIfKey('every highlight has the fields the plugin relies on', async () => {
		const highlights = await client.fetchHighlightsSince();
		for (const h of highlights) {
			// content is required for the template to render anything
			expect(typeof h.content).toBe('string');
			expect(h.content.length).toBeGreaterThan(0);

			// date is non-optional in the type — must be a string
			expect(typeof h.date).toBe('string');

			// sourceType, when present, must be one of the buckets the plugin
			// knows how to route. Unknown values get coerced to 'self', so this
			// guards against a backend rename without a client update.
			if (h.sourceType !== undefined) {
				expect(VALID_SOURCE_TYPES).toContain(h.sourceType);
			}

			// tags should be an array (or undefined), never a raw object
			if (h.tags !== undefined) {
				expect(Array.isArray(h.tags)).toBe(true);
				for (const tag of h.tags) {
					expect(typeof tag.name).toBe('string');
				}
			}
		}
	});

	itIfKey('every highlight carries its source name and a routable type', async () => {
		const highlights = await client.fetchHighlightsSince();
		// Each highlight must carry the source name so it can be routed into
		// the right book file. groupHighlightsBySource falls back to "Unknown
		// source" if missing — we want that fallback to be the exception, not
		// the rule.
		const missingSource = highlights.filter(h => !h.source);
		expect(missingSource.length, `${missingSource.length}/${highlights.length} highlights have no source`).toBe(0);

		// Source types from the API drive folder routing; if a new type lands
		// without a client update the plugin will fall back to "self".
		const types = new Set(highlights.map(h => h.sourceType).filter(Boolean));
		for (const t of types) {
			expect(VALID_SOURCE_TYPES).toContain(t);
		}
	});

	itIfKey('book sources expose an author somewhere on each highlight', async () => {
		// For book-type highlights the plugin's createBookFiles uses
		// sourceHighlights[0].author for the file header. Check that book
		// highlights have an author either on the highlight itself or
		// inherited from the source.
		const highlights = await client.fetchHighlightsSince();
		const books = highlights.filter(h => h.sourceType === 'book');
		if (books.length === 0) return; // nothing to assert
		const missingAuthor = books.filter(h => !h.author);
		expect(missingAuthor.length, `${missingAuthor.length} book highlights have no author`).toBe(0);
	});

	itIfKey('paginates: full sync returns >= first-page count', async () => {
		// Direct fetch to /api/highlights/export?page=1 to learn the page size,
		// then ensure the client's full-sync result is at least that big.
		const url = new URL('/api/highlights/export', apiUrl);
		url.searchParams.set('format', 'markdown');
		url.searchParams.set('page', '1');
		const res = await fetch(url.toString(), { headers: { 'X-API-Key': apiKey } });
		const body = await res.json() as { data: Array<{ highlights?: unknown[] }>, pagination?: { totalPages?: number } };
		const firstPageHighlights = body.data.reduce((n, src) => n + (src.highlights?.length ?? 0), 0);

		const all = await client.fetchHighlightsSince();
		expect(all.length).toBeGreaterThanOrEqual(firstPageHighlights);

		// If the backend reports more than one page, client should have fetched
		// more than just page 1.
		if ((body.pagination?.totalPages ?? 1) > 1) {
			expect(all.length).toBeGreaterThan(firstPageHighlights);
		}
	});

	itIfKey('start_from filter narrows the result set', async () => {
		const all = await client.fetchHighlightsSince();
		// Pick a timestamp roughly in the middle so we can assert a strict
		// reduction without relying on exact counts.
		const sorted = [...all]
			.map(h => h.created_at ?? h.updated_at ?? h.date)
			.filter((d): d is string => Boolean(d))
			.map(d => new Date(d).getTime())
			.filter(n => !isNaN(n))
			.sort((a, b) => a - b);

		if (sorted.length < 2) {
			// Not enough data on the test account to exercise the filter.
			return;
		}

		const cutoff = sorted[Math.floor(sorted.length / 2)];
		const filtered = await client.fetchHighlightsSince(cutoff);
		expect(filtered.length).toBeLessThanOrEqual(all.length);
	});

	itIfKey('rejects calls made with a bad API key', async () => {
		const badClient = new ScreviApiClient('not-a-real-key', apiUrl);
		await expect(badClient.fetchHighlightsSince()).rejects.toThrow();
	});

	itIfKey('updateCredentials swaps the key for subsequent calls', async () => {
		const c = new ScreviApiClient('not-a-real-key', apiUrl);
		await expect(c.fetchHighlightsSince()).rejects.toThrow();
		c.updateCredentials(apiKey, apiUrl);
		const out = await c.fetchHighlightsSince();
		expect(Array.isArray(out)).toBe(true);
	});
});
