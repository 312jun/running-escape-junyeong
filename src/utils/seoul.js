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
