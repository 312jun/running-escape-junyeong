function parsePoint(value) {
  const [lat, lng] = String(value || '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'GET only' }))
    return
  }

  const from = parsePoint(req.query?.from)
  const to = parsePoint(req.query?.to)
  if (!from || !to) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'from/to 필요' }))
    return
  }

  const osrm = `https://router.project-osrm.org/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`

  try {
    const upstream = await fetch(osrm, { headers: { Accept: 'application/json' } })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.end(text)
  } catch (err) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: err.message || 'route failed' }))
  }
}
