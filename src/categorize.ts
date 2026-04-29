import { ScreviHighlight, SyncCategory } from './api';

const YOUTUBE_HOST_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?:\/|$)/i;

export function isYouTubeUrl(url?: string | null): boolean {
	if (!url) return false;
	return YOUTUBE_HOST_RE.test(url.trim());
}

/**
 * Map a highlight to one of the user-facing sync categories.
 *
 * The export endpoint UNIONs the sources and articles tables and overwrites
 * type='article' for everything from the articles table, so type alone can't
 * distinguish a "Document" (sources.type='article') from a YouTube video
 * (articles table with a youtube URL). The discriminator is source_id /
 * article_id — exactly one is non-null per row.
 */
export function categorize(highlight: ScreviHighlight): SyncCategory {
	const type = highlight.sourceType;
	if (type === 'book') return 'books';
	if (type === 'tweet') return 'posts';
	if (type === 'self') return 'personalNotes';

	if (type === 'article') {
		// articles-table rows: split YouTube vs everything else by URL.
		if (highlight.article_id) {
			return isYouTubeUrl(highlight.url) ? 'youtube' : 'articles';
		}
		// sources-table rows with type='article' are Documents.
		if (highlight.source_id) return 'documents';
		// Pre-discriminator backend or unexpected data: fall back by URL so
		// YouTube items still route correctly.
		return isYouTubeUrl(highlight.url) ? 'youtube' : 'articles';
	}

	// Unknown future type (`youtube` source, podcast, pdf, etc.) — treat as
	// "articles" so it still syncs by default rather than getting silently
	// dropped.
	return 'articles';
}

const CATEGORY_FOLDERS: Record<SyncCategory, string> = {
	books: 'Books',
	posts: 'Posts',
	articles: 'Articles',
	documents: 'Documents',
	youtube: 'YouTube',
	personalNotes: 'Personal Notes',
};

export function categoryFolderName(category: SyncCategory): string {
	return CATEGORY_FOLDERS[category];
}

const CATEGORY_LABELS: Record<SyncCategory, string> = {
	books: 'Books',
	posts: 'Posts',
	articles: 'Articles',
	documents: 'Documents',
	youtube: 'YouTube videos',
	personalNotes: 'Personal notes',
};

export function categoryLabel(category: SyncCategory): string {
	return CATEGORY_LABELS[category];
}
