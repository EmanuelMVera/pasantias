import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // Redirige /api y /uploads al backend local — así solo se necesita 1 túnel
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
