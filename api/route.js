import { fetchWalkingRoute, parsePoint, parseVias } from '../shared/foot-route.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'GET only' }))
    return
  }

  const from = parsePoint(req.query?.from)
  const to = parsePoint(req.query?.to)
  const vias = parseVias(req.query?.via)
  if (!from || !to) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'from/to 필요' }))
    return
  }

  try {
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY
    const preferOsrm = String(req.query?.street || '') === '1'
    const route = await fetchWalkingRoute(from, to, vias, { googleKey, preferOsrm })
    res.statusCode = 200
    res.end(JSON.stringify(route))
  } catch (err) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: err.message || 'route failed' }))
  }
}
