import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.mjs', '.js', '.json'],
  },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:5080',
      '/openapi': 'http://localhost:5080',
      '/health': 'http://localhost:5080',
    },
  },
})
