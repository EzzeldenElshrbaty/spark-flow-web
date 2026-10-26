import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // A production build is the real app: without the backend switch it would ship the prototype (sample data, no
  // sign-in) to crm.spark-sys.com, so the build stops instead. `vite build --mode prototype` still builds the prototype.
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (env.VITE_BACKEND !== 'on' || !env.VITE_API_URL) {
      throw new Error('Production build needs VITE_BACKEND=on and VITE_API_URL (Amplify → Hosting → Environment variables).')
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Forward API calls to the ASP.NET Core backend during development.
      proxy: {
        '/api': 'http://localhost:5080',
      },
    },
  }
})
