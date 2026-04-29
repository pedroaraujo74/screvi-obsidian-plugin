import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

const obsidianMock = fileURLToPath(new URL('./tests/__mocks__/obsidian.ts', import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			obsidian: obsidianMock,
		},
		// Prefer .ts over .js so importing `../main` resolves to source,
		// not the bundled artifact that has obsidian as an external import.
		extensions: ['.ts', '.mts', '.js', '.mjs', '.json'],
	},
	test: {
		environment: 'node',
		globals: false,
		include: ['tests/**/*.test.ts'],
		testTimeout: 30_000,
	},
});
