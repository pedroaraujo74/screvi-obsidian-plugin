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
	// Source discriminator from /api/highlights/export. Exactly one is
	// non-null per row in the API response. source_id is set for rows from
	// the sources table (books, tweets, self, plus type='article' rows that
	// originated as Documents). article_id is set for rows from the articles
	// table (web articles, YouTube videos, etc., always type='article').
	source_id?: string | null;
	article_id?: string | null;
}

export type SyncCategory = 'books' | 'posts' | 'articles' | 'documents' | 'youtube' | 'personalNotes';

export const SYNC_CATEGORIES: SyncCategory[] = ['books', 'posts', 'articles', 'documents', 'youtube', 'personalNotes'];

export interface Source {
	id: string;
	name: string;
	type: string;
	author?: string;
	url?: string;
	highlights: ScreviHighlight[];
}
