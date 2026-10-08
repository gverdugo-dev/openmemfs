import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The editor lives in web/ and builds to dist/web, which the server serves. In development
// Vite serves it on 5173 and sends /api to the server on 8080 (scripts/dev.ts starts both).
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 8080}` },
  },
})
