import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { geminiProxy } from './plugins/gemini-proxy.js'
import { routeProxy } from './plugins/route-proxy.js'
import { weatherProxy } from './plugins/weather-proxy.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY
  const googleKey = env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY
  const kmaKey = env.KMA_SERVICE_KEY

  return {
    plugins: [react(), geminiProxy(apiKey), routeProxy(googleKey), weatherProxy(kmaKey)],
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(googleKey || ''),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
  }
})
