import { requestUrl } from 'obsidian';
import { ScreviHighlight, HighlightTag, API_BASE_URL } from './types';
import { decodeHtmlEntities } from '../utils';

export class ScreviApiClient {
	private apiKey: string;
	private apiUrl: string;

	constructor(apiKey: string, apiUrl: string = API_BASE_URL) {
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
	}

	private async makeRequest<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
		const url = new URL(`${this.apiUrl}${endpoint}`);
		
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					// Convert value to string, handling objects and arrays properly
					let stringValue: string;
					if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
						stringValue = String(value);
					} else if (value instanceof Date) {
						stringValue = value.toISOString();
					} else {
						// For objects and arrays, use JSON.stringify
						stringValue = JSON.stringify(value);
					}
					url.searchParams.append(key, stringValue);
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

	async fetchHighlightsSince(start_from?: number): Promise<ScreviHighlight[]> {
		let allSources: unknown[] = [];
		let currentPage = 1;
		let hasMore = true;

		// Fetch all pages with start_from parameter using consistent endpoint
		while (hasMore) {
			const params: Record<string, unknown> = {
				format: 'markdown',
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
			
			// Fix #3: Explicit parenthesization for clarity
			hasMore = !Array.isArray(response) &&
				((response as { pagination?: { hasMore?: boolean } }).pagination?.hasMore ?? false);
			currentPage++;
		}

		// Flatten all highlights from all sources
		const allHighlights: ScreviHighlight[] = [];
		for (const source of allSources) {
			const sourceObj = source as { highlights?: unknown[]; name?: string; type?: string; author?: string; url?: string; created_at?: string };
			if (sourceObj.highlights && Array.isArray(sourceObj.highlights)) {
				for (const highlight of sourceObj.highlights) {
					const highlightObj = highlight as Record<string, unknown>;
					
					// Normalize tags to HighlightTag[] format
					let tags: HighlightTag[] | undefined;
					if (Array.isArray(highlightObj.tags)) {
						tags = highlightObj.tags.map((tag: unknown) => {
							if (typeof tag === 'string') {
								return { name: tag };
							}
							if (tag && typeof tag === 'object' && 'name' in tag) {
								return tag as HighlightTag;
							}
							return { name: String(tag) };
						});
					}

					// Create a properly mapped highlight based on actual database schema
					const mappedHighlight: ScreviHighlight = {
						id: highlightObj.id as string | undefined,
						content: decodeHtmlEntities(highlightObj.content as string || ''),
						note: highlightObj.notes as string | undefined,
						source: sourceObj.name,
						sourceType: sourceObj.type as ScreviHighlight['sourceType'],
						title: decodeHtmlEntities(sourceObj.name || ''),
						author: (highlightObj.author || sourceObj.author) as string | undefined,
						url: (highlightObj.url || sourceObj.url) as string | undefined,
						date: (highlightObj.created_at || sourceObj.created_at) as string || '',
						created_at: (highlightObj.created_at || sourceObj.created_at) as string | undefined,
						updated_at: highlightObj.updated_at as string | undefined,
						tags,
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

	updateCredentials(apiKey: string, apiUrl: string = API_BASE_URL) {
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
	}
}
