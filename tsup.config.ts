import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/script.ts', 'src/next.ts', 'src/client.ts', 'src/react.ts', 'src/react-client.ts'],
	// Preserve the React server/client boundary and the client entry's directive.
	external: ['./react-client.js'],
	format: ['esm'],
	dts: true,
	sourcemap: true,
	clean: true,
	target: 'node20',
	platform: 'node',
});
