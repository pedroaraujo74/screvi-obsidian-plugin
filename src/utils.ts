/**
 * Decode HTML entities and JSON escape sequences from text content.
 * Shared utility used by both the API client and the plugin.
 */
export function decodeHtmlEntities(text: string): string {
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
	decoded = decoded.replace(/&#(\d+);/g, (_match, num) => {
		return String.fromCharCode(parseInt(num, 10));
	});

	// Replace hex entities (like &#x27; etc.)
	decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
		return String.fromCharCode(parseInt(hex, 16));
	});

	return decoded;
}
