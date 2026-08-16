function readUrl(req) {
  const host = req.headers.host || '127.0.0.1'
  return new URL(req.url, `http://${host}`)
}

function parsePoint(value) {
  const [lat, lng] = String(value || '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export function routeProxy() {
  return {
    name: 'route-proxy',
    configureServer(server) {
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
        if (!from || !to) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'from/to 필요' }))
          return
        }

        const osrm = `https://router.project-osrm.org/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`

        try {
          const upstream = await fetch(osrm, {
            headers: { Accept: 'application/json' },
          })
          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'route failed' }))
        }
      })
    },
  }
}
