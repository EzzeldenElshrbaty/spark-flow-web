/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
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
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            setupFiles: ['src/test/signedIn.ts'],
            environment: 'node',
            include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
            exclude: ['src/**/*.browser.test.tsx'],
            // *.test.tsx render components: they opt into jsdom with a `// @vitest-environment jsdom` first line.
            // Days are the company's (Cairo), so tests that build "today" from local midnight read the same anywhere.
            env: { TZ: 'Africa/Cairo' },
          },
        },
        {
          // What needs real layout (scrolling, sizes) runs in headless Chromium: `npx playwright install
          // chromium-headless-shell` once per machine.
          extends: true,
          test: {
            name: 'browser',
            setupFiles: ['src/test/signedIn.ts'],
            include: ['src/**/*.browser.test.tsx'],
            // One file at a time: they share one browser tab, and focus (which editors and scrolling need) is one too.
            fileParallelism: false,
            browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
          },
        },
      ],
    },
  }
})
