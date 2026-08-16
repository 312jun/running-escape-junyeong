import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { geminiProxy } from './plugins/gemini-proxy.js'
import { routeProxy } from './plugins/route-proxy.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY

  return {
    plugins: [react(), geminiProxy(apiKey), routeProxy()],
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
  }
})
