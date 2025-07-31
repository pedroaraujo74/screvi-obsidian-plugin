import { ScreviHighlight, Source, PaginatedResponse } from './types';

export class ScreviApiClient {
	private apiKey: string;
	private apiUrl: string;

	constructor(apiKey: string, apiUrl: string) {
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
	}

	private async makeRequest<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
		const url = new URL(`${this.apiUrl}${endpoint}`);
		
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					url.searchParams.append(key, String(value));
				}
			});
		}

		const response = await fetch(url.toString(), {
			headers: {
				'X-API-Key': this.apiKey,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error(`API request failed: ${response.statusText}`);
		}

		return response.json();
	}

	async fetchAllHighlights(format: string = 'markdown'): Promise<ScreviHighlight[]> {
		let allSources: any[] = [];
		let currentPage = 1;
		let hasMore = true;

		// Fetch all pages using consistent endpoint
		while (hasMore) {
			const response = await this.makeRequest<any>('/api/highlights/export', {
				format,
				page: currentPage
			});

			// Handle both possible response structures
			const responseData = response.data || response;
			allSources = [...allSources, ...responseData];
			
			hasMore = response.pagination?.hasMore || false;
			currentPage++;
		}

		// Flatten all highlights from all sources
		const allHighlights: ScreviHighlight[] = [];
		for (const source of allSources) {
			if (source.highlights && Array.isArray(source.highlights)) {
				for (const highlight of source.highlights) {
					// Create a properly mapped highlight based on actual database schema
					const mappedHighlight: ScreviHighlight = {
						// Map actual database fields to interface
						id: highlight.id,
						content: highlight.content,
						note: highlight.notes, // Database uses 'notes', interface expects 'note'
						source: source.name, // Use source name from parent object
						sourceType: source.type, // Use source type from parent object
						title: source.name, // Use source name as title for highlights
						author: highlight.author || source.author, // Highlight has author field
						url: highlight.url || source.url,
						date: highlight.created_at || source.created_at,
						created_at: highlight.created_at || source.created_at,
						updated_at: highlight.updated_at || source.updated_at,
						tags: highlight.tags,
						chapter: highlight.chapter,
						page: highlight.page,
						location: highlight.location,
						color: highlight.color,
						book_id: highlight.book_id,
						metadata: highlight.metadata
					};
					
					allHighlights.push(mappedHighlight);
				}
			}
		}

		return allHighlights;
	}

	async fetchHighlightsSince(start_from?: number, format: string = 'markdown'): Promise<ScreviHighlight[]> {
		let allSources: any[] = [];
		let currentPage = 1;
		let hasMore = true;

		// Fetch all pages with start_from parameter using consistent endpoint
		while (hasMore) {
			const params: Record<string, any> = {
				format,
				page: currentPage
			};
			
			if (start_from) {
				// Convert timestamp to ISO string format for database compatibility
				params.start_from = new Date(start_from).toISOString();
			}

			const response = await this.makeRequest<any>('/api/highlights/export', params);

			// Handle both possible response structures
			const responseData = response.data || response;
			allSources = [...allSources, ...responseData];
			
			hasMore = response.pagination?.hasMore || false;
			currentPage++;
		}

		// Flatten all highlights from all sources
		const allHighlights: ScreviHighlight[] = [];
		for (const source of allSources) {
			if (source.highlights && Array.isArray(source.highlights)) {
				for (const highlight of source.highlights) {
					// Create a properly mapped highlight based on actual database schema
					const mappedHighlight: ScreviHighlight = {
						// Map actual database fields to interface
						id: highlight.id,
						content: highlight.content,
						note: highlight.notes, // Database uses 'notes', interface expects 'note'
						source: source.name, // Use source name from parent object
						sourceType: source.type, // Use source type from parent object
						title: source.name, // Use source name as title for highlights
						author: highlight.author || source.author, // Highlight has author field
						url: highlight.url || source.url,
						date: highlight.created_at || source.created_at,
						created_at: highlight.created_at || source.created_at,
						updated_at: highlight.updated_at || source.updated_at,
						tags: highlight.tags,
						chapter: highlight.chapter,
						page: highlight.page,
						location: highlight.location,
						color: highlight.color,
						book_id: highlight.book_id,
						metadata: highlight.metadata
					};
					
					allHighlights.push(mappedHighlight);
				}
			}
		}

		return allHighlights;
	}

	async fetchSources(): Promise<Source[]> {
		let allSources: any[] = [];
		let currentPage = 1;
		let hasMore = true;

		while (hasMore) {
			const response = await this.makeRequest<any>('/api/highlights/export', {
				format: 'markdown',
				page: currentPage
			});

			// Handle both possible response structures
			const responseData = response.data || response;
			allSources = [...allSources, ...responseData];
			
			hasMore = response.pagination?.hasMore || false;
			currentPage++;
		}

		// Map sources to expected interface
		return allSources.map(source => ({
			id: source.id || source.asin || source.name,
			name: source.name,
			type: source.type,
			author: source.author,
			url: source.url,
			highlights: source.highlights || []
		}));
	}

	updateCredentials(apiKey: string, apiUrl: string) {
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
	}
} 

