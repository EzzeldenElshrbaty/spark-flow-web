/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // A production build is the real app: without the backend switch it would ship the prototype (sample data, no
  // sign-in), so the build stops instead. `vite build --mode prototype` still builds the prototype.
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (env.VITE_BACKEND !== 'on' || !env.VITE_API_URL) {
      throw new Error('Production build needs VITE_BACKEND=on and VITE_API_URL. Use "vite build --mode prototype" for the demo.')
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Forward API and SignalR calls to the ASP.NET Core backend during development.
      proxy: {
        '/api': 'http://localhost:5080',
        '/hubs': { target: 'http://localhost:5080', ws: true },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
