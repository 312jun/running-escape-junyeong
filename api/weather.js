import { fetchKmaWeather } from '../shared/kma-weather.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'GET only' }))
    return
  }

  const serviceKey = process.env.KMA_SERVICE_KEY
  if (!serviceKey) {
    res.statusCode = 503
    res.end(JSON.stringify({ error: 'KMA_SERVICE_KEY가 없습니다.' }))
    return
  }

  const lat = Number(req.query?.lat)
  const lng = Number(req.query?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'lat/lng 필요' }))
    return
  }

  try {
    const weather = await fetchKmaWeather(lat, lng, serviceKey)
    res.statusCode = 200
    res.end(JSON.stringify(weather))
  } catch (err) {
    res.statusCode = err.statusCode && err.statusCode < 600 ? err.statusCode : 502
    res.end(JSON.stringify({ error: err.message || 'weather failed' }))
  }
}
