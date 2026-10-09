import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // wrangler dev default port 8787 → scan-struk lokal tanpa deploy
      '/api': 'http://localhost:8787',
    },
  },
})
