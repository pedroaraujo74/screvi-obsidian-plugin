export const API_BASE_URL = 'https://api.screvi.com';

export type SourceType = 'book' | 'tweet' | 'self' | 'article' | 'youtube';

export const VALID_SOURCE_TYPES: SourceType[] = ['book', 'tweet', 'self', 'article', 'youtube'];

export interface HighlightTag {
	name: string;
}

export interface ScreviHighlight {
	id?: string;
	content: string;
	note?: string;
	source?: string;
	sourceType?: SourceType;
	title?: string;
	author?: string;
	url?: string;
	date: string;
	created_at?: string;
	updated_at?: string;
	tags?: HighlightTag[];
	chapter?: string;
	page?: number;
	location?: string;
	color?: string;
	book_id?: string;
	metadata?: Record<string, unknown>;
}

export interface Source {
	id: string;
	name: string;
	type: string;
	author?: string;
	url?: string;
	highlights: ScreviHighlight[];
}
