import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/hydronu': {
        target: 'https://vattenwebb.smhi.se',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/hydronu/, '/hydronu'),
      },
    },
  },
})
