import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		ssr: true,
		target: 'node20',
		outDir: 'dist',
		emptyOutDir: false,
		rollupOptions: {
			input: {
				cli: 'cli/main.ts',
				host: 'host/HostProcess.ts',
			},
			output: {
				format: 'esm',
				entryFileNames: '[name].mjs',
				chunkFileNames: 'shared/[name]-[hash].js',
				banner: (chunk) =>
					chunk.name === 'cli' ? '#!/usr/bin/env node\n' : '',
			},
		},
	},
})
