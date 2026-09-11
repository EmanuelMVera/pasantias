import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Salida del build (lo que Vercel publica). Explícito aunque sea el default.
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // DEV: redirige /api y /uploads al backend local — así el navegador
      // siempre habla same-origin (igual que en producción con el rewrite de
      // Vercel). En producción esto lo hace frontend/vercel.json.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // SEC-03: avatares/logos servidos por el backend (/uploads/public/...)
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
