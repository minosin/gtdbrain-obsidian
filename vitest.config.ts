import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The `obsidian` package is types-only; pure modules under test get a tiny stub for the
// few runtime helpers they import.
export default defineConfig({
	test: { include: ['test/**/*.test.ts'] },
	resolve: { alias: { obsidian: fileURLToPath(new URL('./test/obsidian-stub.ts', import.meta.url)) } },
});
