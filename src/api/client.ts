import { requestUrl } from 'obsidian';
import { ScreviHighlight } from './types';

export class ScreviApiClient {
	private apiKey: string;
	private apiUrl: string;

	constructor(apiKey: string, apiUrl: string) {
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
	}

	private async makeRequest<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
		const url = new URL(`${this.apiUrl}${endpoint}`);
		
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					url.searchParams.append(key, String(value));
				}
			});
		}

		const response = await requestUrl({
			url: url.toString(),
			headers: {
				'X-API-Key': this.apiKey,
				'Content-Type': 'application/json'
			}
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`API request failed: ${response.status}`);
		}

		return response.json as T;
	}

	private decodeHtmlEntities(text: string): string {
		if (!text) return text;
		
		// Common HTML entities that might appear in content
		const entities: { [key: string]: string } = {
			'&amp;': '&',
			'&lt;': '<',
			'&gt;': '>',
			'&quot;': '"',
			'&#39;': "'",
			'&apos;': "'",
			'&nbsp;': ' ',
			'&ndash;': '\u2013',
			'&mdash;': '\u2014',
			'&hellip;': '\u2026',
			'&lsquo;': '\u2018',
			'&rsquo;': '\u2019',
			'&ldquo;': '\u201c',
			'&rdquo;': '\u201d'
		};

		let decoded = text;

		// First handle JSON escape sequences
		decoded = decoded
			.replace(/\\n/g, '\n')      // Newlines
			.replace(/\\t/g, '\t')      // Tabs  
			.replace(/\\r/g, '\r')      // Carriage returns
			.replace(/\\"/g, '"')       // Escaped quotes
			.replace(/\\\\/g, '\\');    // Escaped backslashes (do this last)

		// Replace named HTML entities
		for (const [entity, replacement] of Object.entries(entities)) {
			if (decoded.includes(entity)) {
				decoded = decoded.replace(new RegExp(entity, 'g'), replacement);
			}
		}

		// Replace numeric entities (like &#39; &#8217; etc.)
		decoded = decoded.replace(/&#(\d+);/g, (match, num) => {
			return String.fromCharCode(parseInt(num, 10));
		});

		// Replace hex entities (like &#x27; etc.)
		decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
			return String.fromCharCode(parseInt(hex, 16));
		});

		return decoded;
	}

	async fetchHighlightsSince(start_from?: number, format: string = 'markdown'): Promise<ScreviHighlight[]> {
		let allSources: unknown[] = [];
		let currentPage = 1;
		let hasMore = true;

		// Fetch all pages with start_from parameter using consistent endpoint
		while (hasMore) {
			const params: Record<string, unknown> = {
				format,
				page: currentPage
			};
			
			if (start_from) {
				// Convert timestamp to ISO string format for database compatibility
				params.start_from = new Date(start_from).toISOString();
			}

			const response = await this.makeRequest<{ data?: unknown[]; pagination?: { hasMore?: boolean } } | unknown[]>('/api/highlights/export', params);

			// Handle both possible response structures
			const responseData = Array.isArray(response) ? response : (response as { data?: unknown[] }).data || [];
			allSources = [...allSources, ...responseData];
			
			hasMore = !Array.isArray(response) && (response as { pagination?: { hasMore?: boolean } }).pagination?.hasMore || false;
			currentPage++;
		}

		// Flatten all highlights from all sources
		const allHighlights: ScreviHighlight[] = [];
		for (const source of allSources) {
			const sourceObj = source as { highlights?: unknown[]; name?: string; type?: string; author?: string; url?: string; created_at?: string };
			if (sourceObj.highlights && Array.isArray(sourceObj.highlights)) {
				for (const highlight of sourceObj.highlights) {
					const highlightObj = highlight as Record<string, unknown>;
					// Create a properly mapped highlight based on actual database schema
					const mappedHighlight: ScreviHighlight = {
						// Map actual database fields to interface
						id: highlightObj.id as string | undefined,
						content: this.decodeHtmlEntities(highlightObj.content as string || ''),
						note: highlightObj.notes as string | undefined, // Database uses 'notes', interface expects 'note'
						source: sourceObj.name, // Use source name from parent object
						sourceType: sourceObj.type, // Use source type from parent object
						title: this.decodeHtmlEntities(sourceObj.name || ''), // Use source name as title for highlights
						author: (highlightObj.author || sourceObj.author) as string | undefined, // Highlight has author field
						url: (highlightObj.url || sourceObj.url) as string | undefined,
						date: (highlightObj.created_at || sourceObj.created_at) as string || '',
						created_at: (highlightObj.created_at || sourceObj.created_at) as string | undefined,
						updated_at: highlightObj.updated_at as string | undefined,
						tags: highlightObj.tags as string[] | undefined,
						chapter: highlightObj.chapter as string | undefined,
						page: highlightObj.page as number | undefined,
						location: highlightObj.location as string | undefined,
						color: highlightObj.color as string | undefined,
						book_id: highlightObj.book_id as string | undefined,
						metadata: highlightObj.metadata as Record<string, unknown> | undefined
					};
					
					allHighlights.push(mappedHighlight);
				}
			}
		}

		return allHighlights;
	}

	updateCredentials(apiKey: string, apiUrl: string) {
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
	}
}
