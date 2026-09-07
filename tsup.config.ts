import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/script.ts', 'src/next.ts', 'src/client.ts'],
	format: ['esm'],
	dts: true,
	sourcemap: true,
	clean: true,
	target: 'node20',
	platform: 'node',
});
