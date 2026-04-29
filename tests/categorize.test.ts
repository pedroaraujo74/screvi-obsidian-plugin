import { describe, expect, it } from 'vitest';
import { categorize, categoryFolderName, categoryLabel, isYouTubeUrl } from '../src/categorize';
import type { ScreviHighlight } from '../src/api';

const hl = (overrides: Partial<ScreviHighlight> = {}): ScreviHighlight => ({
	content: 'x',
	date: '2026-01-01T00:00:00Z',
	...overrides,
});

describe('isYouTubeUrl', () => {
	it.each([
		'https://www.youtube.com/watch?v=abc',
		'http://youtube.com/watch?v=abc',
		'https://youtu.be/abc',
		'https://m.youtube.com/watch?v=abc',
		'https://www.youtube-nocookie.com/embed/abc',
		'youtube.com/shorts/abc',
		'https://YOUTUBE.com/watch',
	])('returns true for %s', url => {
		expect(isYouTubeUrl(url)).toBe(true);
	});

	it.each([
		undefined,
		null,
		'',
		'https://medium.com/p/abc',
		'https://example.com/youtube-clone',
		'https://notyoutube.com',
		'https://fakeyoutube.com.evil.com',
	])('returns false for %s', url => {
		expect(isYouTubeUrl(url as string | null | undefined)).toBe(false);
	});

	it('trims whitespace before matching', () => {
		expect(isYouTubeUrl('  https://youtu.be/x  ')).toBe(true);
	});
});

describe('categorize', () => {
	it('routes books, posts, and self by sourceType', () => {
		expect(categorize(hl({ sourceType: 'book' }))).toBe('books');
		expect(categorize(hl({ sourceType: 'tweet' }))).toBe('posts');
		expect(categorize(hl({ sourceType: 'self' }))).toBe('personalNotes');
	});

	it('articles with article_id and a non-YouTube URL are "articles"', () => {
		const h = hl({ sourceType: 'article', article_id: 'a1', url: 'https://medium.com/p/x' });
		expect(categorize(h)).toBe('articles');
	});

	it('articles with article_id and a YouTube URL are "youtube"', () => {
		const h = hl({ sourceType: 'article', article_id: 'a1', url: 'https://youtu.be/x' });
		expect(categorize(h)).toBe('youtube');
	});

	it('articles with source_id are "documents"', () => {
		const h = hl({ sourceType: 'article', source_id: 's1' });
		expect(categorize(h)).toBe('documents');
	});

	it('falls back to URL heuristic when both discriminators are missing (pre-deploy backend)', () => {
		expect(categorize(hl({ sourceType: 'article', url: 'https://youtube.com/watch?v=x' }))).toBe('youtube');
		expect(categorize(hl({ sourceType: 'article', url: 'https://medium.com/p/x' }))).toBe('articles');
		expect(categorize(hl({ sourceType: 'article' }))).toBe('articles');
	});

	it('treats unknown future sourceTypes as articles rather than dropping them', () => {
		const h = hl({ sourceType: 'podcast' as unknown as ScreviHighlight['sourceType'] });
		expect(categorize(h)).toBe('articles');
	});

	it('article_id wins over a stray source_id when both are set (defensive)', () => {
		// The API contract says exactly one is non-null, but if both leak
		// through we trust the articles-table id since it carries the
		// YouTube-vs-article URL signal.
		const h = hl({ sourceType: 'article', article_id: 'a1', source_id: 's1', url: 'https://youtu.be/x' });
		expect(categorize(h)).toBe('youtube');
	});
});

describe('category folder names and labels', () => {
	it('every category has a stable folder name and human label', () => {
		const cats = ['books', 'posts', 'articles', 'documents', 'youtube', 'personalNotes'] as const;
		for (const c of cats) {
			expect(categoryFolderName(c)).toMatch(/^[A-Z][\w ]+$/);
			expect(categoryLabel(c).length).toBeGreaterThan(0);
		}
	});
});
