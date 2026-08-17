/** 서울시 대략 경계 (한강 러닝 앱용) */
const SEOUL = {
  minLat: 37.413,
  maxLat: 37.715,
  minLng: 126.734,
  maxLng: 127.269,
}

export function isInSeoul(lat, lng) {
  const a = Number(lat)
  const b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return a >= SEOUL.minLat && a <= SEOUL.maxLat && b >= SEOUL.minLng && b <= SEOUL.maxLng
}

function looksLikeSeoul(hit) {
  const text = `${hit.display_name || ''} ${hit.name || ''}`.toLowerCase()
  if (text.includes('서울') || text.includes('seoul')) return true
  return isInSeoul(hit.lat, hit.lon)
}

export async function searchSeoulPlaces(query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${q} 서울`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '6')
  url.searchParams.set('countrycodes', 'kr')
  url.searchParams.set('viewbox', '126.734,37.715,127.269,37.413')
  url.searchParams.set('bounded', '1')

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('검색 실패')

  const list = await res.json().catch(() => [])
  return (Array.isArray(list) ? list : [])
    .map((hit) => {
      const lat = Number(hit.lat)
      const lng = Number(hit.lon)
      if (!isInSeoul(lat, lng) && !looksLikeSeoul(hit)) return null
      if (!isInSeoul(lat, lng)) return null
      const name =
        hit.namedetails?.name ||
        hit.name ||
        hit.display_name?.split(',')[0] ||
        q
      return {
        name: String(name).trim(),
        label: String(hit.display_name || name).trim(),
        lat,
        lng,
      }
    })
    .filter(Boolean)
}

export async function geocodeSeoulName(name) {
  const hits = await searchSeoulPlaces(name)
  return hits[0] ?? null
}

export async function nearestBusStop(lat, lng, radiusM = 1200) {
  const query = `[out:json][timeout:12];node["highway"="bus_stop"](around:${radiusM},${lat},${lng});out 20;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error('정류장 검색 실패')

  const data = await res.json().catch(() => ({}))
  const nodes = Array.isArray(data.elements) ? data.elements : []
  const ranked = nodes
    .map((node) => {
      const stopLat = Number(node.lat)
      const stopLng = Number(node.lon)
      if (!isInSeoul(stopLat, stopLng)) return null
      const name = String(node.tags?.name || node.tags?.ref || '').trim()
      return {
        name: name || '가까운 버스 정류장',
        lat: stopLat,
        lng: stopLng,
        km: haversine(lat, lng, stopLat, stopLng),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km)

  const best = ranked[0]
  if (!best) return null
  return {
    name: best.name,
    type: 'bus',
    lines: ['버스'],
    coords: { lat: best.lat, lng: best.lng },
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}
