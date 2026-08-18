import { fetchKmaWeather } from '../../shared/kma-weather.js'

export default async (req) => {
  if (req.method !== 'GET') {
    return json({ error: 'GET only' }, 405)
  }

  const serviceKey = process.env.KMA_SERVICE_KEY
  if (!serviceKey) {
    return json({ error: 'KMA_SERVICE_KEY가 없습니다.' }, 503)
  }

  const url = new URL(req.url)
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'lat/lng 필요' }, 400)
  }

  try {
    const weather = await fetchKmaWeather(lat, lng, serviceKey)
    return json(weather)
  } catch (err) {
    const status = err.statusCode && err.statusCode < 600 ? err.statusCode : 502
    return json({ error: err.message || String(err) }, status)
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
