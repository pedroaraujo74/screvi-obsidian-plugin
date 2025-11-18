export type SourceType = 'book' | 'tweet' | 'self' | 'article' | 'youtube';

export const VALID_SOURCE_TYPES: SourceType[] = ['book', 'tweet', 'self', 'article', 'youtube'];

export interface ScreviHighlight {
	id?: string;
	content: string;
	note?: string;
	source?: string;
	sourceType?: string;
	title?: string;
	author?: string;
	url?: string;
	date: string;
	created_at?: string; // Keep for backward compatibility
	updated_at?: string;
	tags?: string[];
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
