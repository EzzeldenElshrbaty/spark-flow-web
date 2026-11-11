/// <reference types="vitest/config" />
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'

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
      // A worktree's node_modules links to the main checkout's, outside the worktree: without its real folder here,
      // files read from packages (the Readex Pro font) aren't served, and chat lays out in a fallback font.
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)))] },
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
          // The bundled dependencies stay in this checkout (`.vite/vitest/<hash>/deps`), not in node_modules/.vite:
          // worktrees link node_modules to the main checkout's, and a run elsewhere rebundling them halfway through this
          // one left its files with two copies of React.
          cacheDir: '.vite',
          // Bundled before the run: found halfway, Vite rebuilt them and reloaded the tab, and every file loading then
          // failed (two copies of React).
          // The page's table and checklist plugins too (chat spec 6.14): found later, @lexical/table was bundled with its
          // own copy of lexical, whose nodes the editor refused.
          optimizeDeps: { include: ['react-dom/client', 'react-router/dom', '@lexical/table', '@lexical/react/LexicalTablePlugin', '@lexical/react/LexicalCheckListPlugin'] },
          test: {
            name: 'browser',
            setupFiles: ['src/test/signedIn.ts'],
            // How much of the UX matrix runs (UX Phase 6): a pairwise set, or every load with UX_MATRIX=full (`npm run test:ux`).
            provide: { uxMatrix: process.env.UX_MATRIX === 'full' ? 'full' : 'pairwise' },
            include: ['src/**/*.browser.test.tsx'],
            // One file at a time: they share one browser tab, and focus (which editors and scrolling need) is one too.
            fileParallelism: false,
            // Chromium's fake microphone and camera, allowed without a prompt: voice and video messages record for real.
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } }),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }
})
