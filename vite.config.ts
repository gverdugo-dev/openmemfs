import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

// TanStack Start on Nitro's Bun preset: `bun run build` writes .output/, and
// `bun .output/server/index.mjs` serves the pages and /api on $PORT.
export default defineConfig({
  server: { host: '127.0.0.1', port: 3000 },
  plugins: [nitro({ preset: 'bun' }), tailwindcss(), tanstackStart(), viteReact()],
})
