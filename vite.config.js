import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ventas/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api/ext': {
        target: 'https://user.com.uy/api/external',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ext/, ''),
        headers: {
           'x-api-key': 'VilardeboyDefensa@2031'
        }
      },
      '/api': {
        target: 'http://3.85.26.173:5005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
