import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// Populate process.env with everything in .env.test so integration tests
// pick up SCREVI_API_KEY. Vite normally only exposes VITE_-prefixed vars,
// so we explicitly use an empty prefix to load all keys.
Object.assign(process.env, loadEnv('test', process.cwd(), ''));

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
