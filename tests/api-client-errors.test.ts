import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Error surfacing. A user who hits an auth problem sees only the Notice text,
 * so "Request failed" — Obsidian's default for a thrown non-2xx — is the whole
 * diagnostic they get. These pin the messages that replaced it.
 */

const status = { value: 200 };

vi.mock('obsidian', () => ({
	requestUrl: vi.fn(async () => ({
		status: status.value,
		headers: {},
		text: '{}',
		json: { data: [], pagination: { hasMore: false } },
		arrayBuffer: new ArrayBuffer(0),
	})),
	normalizePath: (p: string) => p,
}));

const { ScreviApiClient } = await import('../src/api');

beforeEach(() => {
	status.value = 200;
});

describe('API error messages', () => {
	it('names the API key on 401 instead of "Request failed"', async () => {
		status.value = 401;
		const client = new ScreviApiClient('bad-key');

		await expect(client.fetchHighlightsSince()).rejects.toThrow(/API key.*401/i);
	});

	it('points at the subscription on 403', async () => {
		status.value = 403;
		const client = new ScreviApiClient('some-key');

		await expect(client.fetchHighlightsSince()).rejects.toThrow(/read-only|subscription/i);
	});

	it('tells the user to wait on 429', async () => {
		status.value = 429;
		const client = new ScreviApiClient('some-key');

		await expect(client.fetchHighlightsSince()).rejects.toThrow(/rate limit/i);
	});

	it('still succeeds on 200', async () => {
		const client = new ScreviApiClient('some-key');

		await expect(client.fetchHighlightsSince()).resolves.toEqual([]);
	});
});
