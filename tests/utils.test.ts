import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../src/utils';

describe('decodeHtmlEntities', () => {
	it('passes through empty input', () => {
		expect(decodeHtmlEntities('')).toBe('');
	});

	it('decodes named HTML entities', () => {
		expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
		expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>');
		expect(decodeHtmlEntities('&quot;hi&quot;')).toBe('"hi"');
		expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
		expect(decodeHtmlEntities('&apos;a&apos;')).toBe("'a'");
		expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b');
	});

	it('decodes typographic dashes and quotes', () => {
		expect(decodeHtmlEntities('a&ndash;b')).toBe('a–b');
		expect(decodeHtmlEntities('a&mdash;b')).toBe('a—b');
		expect(decodeHtmlEntities('&hellip;')).toBe('…');
		expect(decodeHtmlEntities('&lsquo;a&rsquo;')).toBe('‘a’');
		expect(decodeHtmlEntities('&ldquo;a&rdquo;')).toBe('“a”');
	});

	it('decodes numeric and hex entities', () => {
		expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
		expect(decodeHtmlEntities('&#8217;')).toBe('’');
		expect(decodeHtmlEntities('&#x27;')).toBe("'");
		expect(decodeHtmlEntities('&#x2014;')).toBe('—');
	});

	it('handles JSON-style escape sequences', () => {
		expect(decodeHtmlEntities('line1\\nline2')).toBe('line1\nline2');
		expect(decodeHtmlEntities('a\\tb')).toBe('a\tb');
		expect(decodeHtmlEntities('quote: \\"hi\\"')).toBe('quote: "hi"');
	});

	it('does not double-unescape backslashes', () => {
		// `\\\\` in source = literal `\\` in string. Should become a single `\`.
		expect(decodeHtmlEntities('a\\\\b')).toBe('a\\b');
	});

	it('passes plain ASCII through unchanged', () => {
		const input = 'Just a normal sentence with no entities.';
		expect(decodeHtmlEntities(input)).toBe(input);
	});

	it('handles mixed entity types in one string', () => {
		expect(decodeHtmlEntities('&ldquo;Tom &amp; Jerry&rdquo; &#8212; cartoon')).toBe('“Tom & Jerry” — cartoon');
	});
});
