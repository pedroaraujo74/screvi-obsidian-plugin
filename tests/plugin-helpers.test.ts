import { beforeEach, describe, expect, it } from 'vitest';
import ScreviSyncPlugin from '../main';
import type { ScreviHighlight } from '../src/api';

// Build a stub instance with the prototype so we can call instance methods
// without going through the Obsidian Plugin constructor (which needs a live App).
function makePlugin(overrides: Partial<ScreviSyncPlugin> = {}): ScreviSyncPlugin {
	const stub = Object.create(ScreviSyncPlugin.prototype) as ScreviSyncPlugin;
	stub.settings = {
		apiKey: '',
		syncInterval: 2,
		defaultFolder: 'Screvi Highlights',
		autoSync: true,
		lastSyncTime: 0,
		includeMetadata: true,
		tagPrefix: 'screvi',
		autoLinkFields: ['author'],
		enableAutoLinking: true,
	};
	Object.assign(stub, overrides);
	stub.setupNunjucks();
	return stub;
}

const hl = (overrides: Partial<ScreviHighlight> = {}): ScreviHighlight => ({
	content: 'hi',
	date: '2026-01-01T00:00:00Z',
	...overrides,
});

describe('sanitizeFileName', () => {
	let plugin: ScreviSyncPlugin;
	beforeEach(() => { plugin = makePlugin(); });

	it('removes Windows-forbidden characters', () => {
		expect(plugin.sanitizeFileName('a<b>c:"d|e?f*g')).toBe('abcdefg');
	});

	it('replaces path separators with hyphens', () => {
		expect(plugin.sanitizeFileName('foo/bar\\baz')).toBe('foo-bar-baz');
	});

	it('strips trailing dots and surrounding whitespace', () => {
		expect(plugin.sanitizeFileName('  filename...  ')).toBe('filename');
	});

	it('preserves spaces and unicode', () => {
		expect(plugin.sanitizeFileName("L'Étranger – Camus")).toBe("L'Étranger – Camus");
	});
});

describe('sanitizeTagName', () => {
	let plugin: ScreviSyncPlugin;
	beforeEach(() => { plugin = makePlugin(); });

	it('replaces spaces with hyphens and lowercases', () => {
		expect(plugin.sanitizeTagName('Big Idea')).toBe('big-idea');
	});

	it('strips disallowed characters', () => {
		expect(plugin.sanitizeTagName('foo!@#$bar')).toBe('foobar');
	});

	it('preserves nested-tag slashes and collapses duplicates', () => {
		expect(plugin.sanitizeTagName('Project///Sub Tag')).toBe('project/sub-tag');
	});

	it('strips leading and trailing slashes', () => {
		expect(plugin.sanitizeTagName('/lead/trail/')).toBe('lead/trail');
	});
});

describe('getSourceTypeDisplayName', () => {
	let plugin: ScreviSyncPlugin;
	beforeEach(() => { plugin = makePlugin(); });

	it.each([
		['article', 'Articles'],
		['book', 'Books'],
		['self', 'Personal Notes'],
		['tweet', 'Tweets'],
		['youtube', 'YouTube'],
	])('maps %s -> %s', (input, expected) => {
		expect(plugin.getSourceTypeDisplayName(input)).toBe(expected);
	});

	it('returns the raw value for unknown source types', () => {
		expect(plugin.getSourceTypeDisplayName('podcast')).toBe('podcast');
	});
});

describe('groupHighlightsBySource', () => {
	it('groups by source name and falls back to "Unknown source"', () => {
		const plugin = makePlugin();
		const grouped = plugin.groupHighlightsBySource([
			hl({ content: 'a', source: 'Book A' }),
			hl({ content: 'b', source: 'Book B' }),
			hl({ content: 'c', source: 'Book A' }),
			hl({ content: 'd' }), // no source
		]);
		expect(Object.keys(grouped).sort()).toEqual(['Book A', 'Book B', 'Unknown source']);
		expect(grouped['Book A']).toHaveLength(2);
		expect(grouped['Unknown source']).toHaveLength(1);
	});
});

describe('groupHighlightsBySourceType', () => {
	it('passes through valid source types', () => {
		const plugin = makePlugin();
		const grouped = plugin.groupHighlightsBySourceType([
			hl({ sourceType: 'book' }),
			hl({ sourceType: 'tweet' }),
			hl({ sourceType: 'book' }),
		]);
		expect(grouped.book).toHaveLength(2);
		expect(grouped.tweet).toHaveLength(1);
	});

	it('falls back unknown types to "self"', () => {
		const plugin = makePlugin();
		const grouped = plugin.groupHighlightsBySourceType([
			// cast lets us pass an out-of-band type like the API client might
			hl({ sourceType: 'podcast' as unknown as ScreviHighlight['sourceType'] }),
			hl({}),
		]);
		expect(grouped.self).toHaveLength(2);
	});
});

describe('deduplicateHighlights', () => {
	it('dedupes by id when present', () => {
		const plugin = makePlugin();
		const out = plugin.deduplicateHighlights([
			hl({ id: 'x', content: 'first' }),
			hl({ id: 'x', content: 'first-dupe' }),
			hl({ id: 'y', content: 'second' }),
		]);
		expect(out.map(h => h.id)).toEqual(['x', 'y']);
	});

	it('falls back to content+date key when id is missing', () => {
		const plugin = makePlugin();
		const out = plugin.deduplicateHighlights([
			hl({ content: 'same', created_at: '2026-01-01' }),
			hl({ content: 'same', created_at: '2026-01-01' }),
			hl({ content: 'same', created_at: '2026-01-02' }),
		]);
		expect(out).toHaveLength(2);
	});

	it('mixes id and content fallback within the same batch', () => {
		const plugin = makePlugin();
		const out = plugin.deduplicateHighlights([
			hl({ id: 'a', content: 'A' }),
			hl({ content: 'B', created_at: '2026-02-01' }),
			hl({ content: 'B', created_at: '2026-02-01' }),
			hl({ id: 'a', content: 'A2' }),
		]);
		expect(out).toHaveLength(2);
	});
});

describe('getLatestTimestamp', () => {
	it('returns 0 when no timestamps are present', () => {
		expect(makePlugin().getLatestTimestamp([])).toBe(0);
		expect(makePlugin().getLatestTimestamp([hl({ date: '' })])).toBe(0);
	});

	it('prefers updated_at over created_at when newer', () => {
		const plugin = makePlugin();
		const created = '2026-01-01T00:00:00Z';
		const updated = '2026-02-01T00:00:00Z';
		const ts = plugin.getLatestTimestamp([hl({ created_at: created, updated_at: updated })]);
		expect(ts).toBe(new Date(updated).getTime());
	});

	it('picks the latest across a batch', () => {
		const plugin = makePlugin();
		const ts = plugin.getLatestTimestamp([
			hl({ created_at: '2026-01-01T00:00:00Z' }),
			hl({ created_at: '2026-04-01T00:00:00Z' }),
			hl({ created_at: '2026-02-01T00:00:00Z' }),
		]);
		expect(ts).toBe(new Date('2026-04-01T00:00:00Z').getTime());
	});

	it('skips invalid timestamps gracefully', () => {
		const plugin = makePlugin();
		const ts = plugin.getLatestTimestamp([
			hl({ created_at: 'not-a-date' }),
			hl({ created_at: '2026-03-01T00:00:00Z' }),
		]);
		expect(ts).toBe(new Date('2026-03-01T00:00:00Z').getTime());
	});
});

describe('formatDate', () => {
	let plugin: ScreviSyncPlugin;
	beforeEach(() => { plugin = makePlugin(); });

	it('formats YYYY-MM-DD', () => {
		// Construct date in local timezone so getMonth/getDate match assertions.
		const d = new Date(2026, 0, 5); // Jan 5, 2026 local
		expect(plugin.formatDate(d, 'YYYY-MM-DD')).toBe('2026-01-05');
	});

	it('handles partial format strings', () => {
		const d = new Date(2026, 11, 31);
		expect(plugin.formatDate(d, 'MM/DD')).toBe('12/31');
	});
});

describe('formatAsBlockquote', () => {
	let plugin: ScreviSyncPlugin;
	beforeEach(() => { plugin = makePlugin(); });

	it('prefixes each non-empty line with "> "', () => {
		expect(plugin.formatAsBlockquote('one\ntwo')).toBe('> one\n> two');
	});

	it('preserves empty lines as ">"', () => {
		expect(plugin.formatAsBlockquote('one\n\ntwo')).toBe('> one\n>\n> two');
	});

	it('passes empty input through', () => {
		expect(plugin.formatAsBlockquote('')).toBe('');
	});
});

describe('getNestedValue / setNestedValue', () => {
	let plugin: ScreviSyncPlugin;
	beforeEach(() => { plugin = makePlugin(); });

	it('reads dotted paths and returns undefined for missing keys', () => {
		const obj = { a: { b: { c: 42 } } };
		expect(plugin.getNestedValue(obj, 'a.b.c')).toBe(42);
		expect(plugin.getNestedValue(obj, 'a.x.y')).toBeUndefined();
	});

	it('sets dotted paths, creating intermediate objects', () => {
		const obj: Record<string, unknown> = {};
		plugin.setNestedValue(obj, 'foo.bar.baz', 'hi');
		expect((obj as { foo: { bar: { baz: string } } }).foo.bar.baz).toBe('hi');
	});
});

describe('renderTemplate', () => {
	it('renders a simple variable substitution', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('Hello, {{name}}!', { name: 'World' });
		expect(out).toBe('Hello, World!');
	});

	it('exposes tag_prefix in the template context', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('{{tag_prefix}}', {});
		expect(out).toBe('screvi');
	});

	it('blockquote filter wraps content and decodes entities', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('{{ text | blockquote }}', { text: 'a &amp; b\nsecond' });
		expect(out).toBe('> a & b\n> second');
	});

	it('link filter wraps non-empty strings', () => {
		const plugin = makePlugin();
		expect(plugin.renderTemplate('{{ "Camus" | link }}', {})).toBe('[[Camus]]');
		expect(plugin.renderTemplate('{{ "" | link }}', {})).toBe('');
	});

	it('sanitize_tag filter applies the same rules as sanitizeTagName', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('{{ "Big Idea!" | sanitize_tag }}', {});
		expect(out).toBe('big-idea');
	});

	it('auto-links configured fields when enableAutoLinking is on', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('{{author}}', { author: 'Camus' });
		expect(out).toBe('[[Camus]]');
	});

	it('does not double-wrap an already-linked field', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('{{author}}', { author: '[[Camus]]' });
		expect(out).toBe('[[Camus]]');
	});

	it('skips auto-linking when disabled', () => {
		const plugin = makePlugin({
			settings: {
				...makePlugin().settings,
				enableAutoLinking: false,
			},
		});
		const out = plugin.renderTemplate('{{author}}', { author: 'Camus' });
		expect(out).toBe('Camus');
	});

	it('returns a friendly error string when the template is broken', () => {
		const plugin = makePlugin();
		const out = plugin.renderTemplate('{% if %}', {});
		expect(out.startsWith('Template Error:')).toBe(true);
	});
});
