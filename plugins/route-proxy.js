import { fetchWalkingRoute, parsePoint, parseVias } from '../shared/foot-route.js'

function readUrl(req) {
  const host = req.headers.host || '127.0.0.1'
  return new URL(req.url, `http://${host}`)
}

export function routeProxy(googleKey) {
  return {
    name: 'route-proxy',
    configureServer(server) {
      if (googleKey) {
        console.log('[route-proxy] 구글 도보 길찾기 사용')
      } else {
        console.log('[route-proxy] 구글 키 없음 — BRouter 도보를 메인으로 씁니다')
      }

      server.middlewares.use('/api/route', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'GET only' }))
          return
        }

        const url = readUrl(req)
        const from = parsePoint(url.searchParams.get('from'))
        const to = parsePoint(url.searchParams.get('to'))
        const vias = parseVias(url.searchParams.get('via'))
        const preferOsrm = url.searchParams.get('street') === '1'
        if (!from || !to) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'from/to 필요' }))
          return
        }

        try {
          const route = await fetchWalkingRoute(from, to, vias, { googleKey, preferOsrm })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(route))
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'route failed' }))
        }
      })
    },
  }
}
