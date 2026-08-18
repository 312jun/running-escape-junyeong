import { fetchKmaWeather } from '../shared/kma-weather.js'

function readUrl(req) {
  const host = req.headers.host || '127.0.0.1'
  return new URL(req.url, `http://${host}`)
}

export function weatherProxy(serviceKey) {
  return {
    name: 'weather-proxy',
    configureServer(server) {
      if (!serviceKey) {
        console.warn('[weather-proxy] API key 없음 — .env에 KMA_SERVICE_KEY를 넣으면 됩니다')
      } else {
        console.log('[weather-proxy] /api/weather 준비됨 (키는 서버에서만 사용)')
      }

      server.middlewares.use('/api/weather', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'GET only' }))
          return
        }

        if (!serviceKey) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'KMA_SERVICE_KEY가 없습니다. .env에 넣어 주세요.' }))
          return
        }

        const url = readUrl(req)
        const lat = Number(url.searchParams.get('lat'))
        const lng = Number(url.searchParams.get('lng'))
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'lat/lng 필요' }))
          return
        }

        try {
          const weather = await fetchKmaWeather(lat, lng, serviceKey)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(weather))
        } catch (err) {
          console.error('[weather-proxy]', err.message || err)
          res.statusCode = err.statusCode && err.statusCode < 600 ? err.statusCode : 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'weather failed' }))
        }
      })
    },
  }
}
