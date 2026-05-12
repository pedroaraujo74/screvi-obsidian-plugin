import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	// Skip bundled/build artifacts, vendored deps, and tests (the obsidianmd
	// rules target shipped source only).
	{
		ignores: [
			"main.js",
			"main.js.map",
			"node_modules/**",
			"tests/**",
			"vitest.config.ts",
			"**/*.mjs",
			"**/*.cjs",
			"**/*.js",
			"package.json",
		],
	},
	// Recommended preset already scopes its TS-aware rules to *.ts / *.tsx
	// and brings its own @typescript-eslint parser config.
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// sample-names complains about example identifiers ("myPlugin",
			// etc.) that don't exist here — turn off to keep signal high.
			"obsidianmd/sample-names": "off",
		},
	},
]);
