import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the FastAPI backend during dev
      '/data': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
      '/user': 'http://127.0.0.1:8000',   // Pipeline + Brain persistence (user_accumulators.json)
      '/chat': 'http://127.0.0.1:8000',   // Context-aware chat (uses current NAICS + brain/pipeline + data)
      '/mcp': 'http://127.0.0.1:8000',
    },
  },
})