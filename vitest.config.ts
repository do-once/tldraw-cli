import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: [
			'cli/**/__tests__/**/*.test.ts',
			'host/**/__tests__/**/*.test.ts',
			'shared/rpc/**/__tests__/**/*.test.ts',
			'client/runtime/**/__tests__/**/*.test.ts',
			'__tests__/**/*.test.ts',
		],
		testTimeout: 10_000,
	},
})
