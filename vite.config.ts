import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

export default defineConfig(() => {
	return {
		server: {
			port: 8789,
			strictPort: true,
		},
		plugins: [react()],
		build: {
			outDir: 'dist/client',
		},
	}
})
