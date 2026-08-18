import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { geminiProxy } from './plugins/gemini-proxy.js'
import { routeProxy } from './plugins/route-proxy.js'
import { weatherProxy } from './plugins/weather-proxy.js'

function gaHtml(gaId) {
  const id = String(gaId || '').trim()
  const valid = /^G-[A-Z0-9]+$/i.test(id)
  const snippet = valid
    ? `
    <link rel="preconnect" href="https://www.googletagmanager.com" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}', { send_page_view: true, anonymize_ip: true });
    </script>`
    : ''

  return {
    name: 'ga-html',
    transformIndexHtml(html) {
      return html.replace('<!-- ga4 -->', snippet)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY
  const googleKey = env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY
  const kmaKey = env.KMA_SERVICE_KEY
  const gaId = env.VITE_GA_MEASUREMENT_ID

  return {
    plugins: [react(), geminiProxy(apiKey), routeProxy(googleKey), weatherProxy(kmaKey), gaHtml(gaId)],
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(googleKey || ''),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
  }
})
