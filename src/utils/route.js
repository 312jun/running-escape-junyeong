import { haversineKm, locateOnTrack } from './geo'

const PACE_MIN_PER_KM = 6

export function etaMin(km) {
  if (!Number.isFinite(km) || km <= 0) return 1
  return Math.max(1, Math.round(km * PACE_MIN_PER_KM))
}

export function pathLengthKm(points) {
  if (!points?.length || points.length < 2) return 0
  let km = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    km += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng)
  }
  return km
}

export function densifyPath(points, maxStepKm = 0.02) {
  if (!points?.length) return []
  const out = [points[0]]
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const seg = Math.max(haversineKm(a.lat, a.lng, b.lat, b.lng), 1e-9)
    const steps = Math.max(1, Math.ceil(seg / maxStepKm))
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      })
    }
  }
  return out
}

export function fallbackPath(from, to) {
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng)
  const n = Math.max(24, Math.round(km * 40))
  const mid = {
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2,
  }
  const dx = to.lng - from.lng
  const dy = to.lat - from.lat
  const len = Math.hypot(dx, dy) || 1
  const bulge = Math.min(0.004, km * 0.00035)
  const bend = {
    lat: mid.lat - (dx / len) * bulge,
    lng: mid.lng + (dy / len) * bulge,
  }

  const curve = []
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const u = 1 - t
    curve.push({
      lat: u * u * from.lat + 2 * u * t * bend.lat + t * t * to.lat,
      lng: u * u * from.lng + 2 * u * t * bend.lng + t * t * to.lng,
    })
  }
  return densifyPath(curve)
}

export function pointAlongPath(points, t) {
  if (!points?.length) return null
  if (points.length === 1) return { ...points[0], heading: 0 }
  const total = pathLengthKm(points)
  const target = Math.max(0, Math.min(1, t)) * total
  let walked = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const seg = haversineKm(a.lat, a.lng, b.lat, b.lng)
    if (walked + seg >= target || i === points.length - 2) {
      const u = seg === 0 ? 0 : (target - walked) / seg
      return {
        lat: a.lat + (b.lat - a.lat) * u,
        lng: a.lng + (b.lng - a.lng) * u,
        heading: bearingDeg(a, b),
      }
    }
    walked += seg
  }
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  return { ...last, heading: bearingDeg(prev, last) }
}

export function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function kmTicks(points) {
  const total = pathLengthKm(points)
  if (total < 0.8) return []
  const ticks = []
  const max = Math.floor(total)
  for (let km = 1; km <= max; km += 1) {
    const pt = pointAlongPath(points, km / total)
    if (pt) ticks.push({ km, lat: pt.lat, lng: pt.lng })
  }
  return ticks
}

export function progressOnPath(points, live) {
  const total = pathLengthKm(points)
  if (!points?.length || !live || total <= 0) {
    return { remaining: total, done: 0, offTrackKm: 0, total, ratio: 0 }
  }
  const { kmFromStart, offTrackKm } = locateOnTrack(live.lat, live.lng, points)
  const done = Math.max(0, Math.min(total, kmFromStart))
  return {
    remaining: Math.max(0, total - done),
    done,
    offTrackKm,
    total,
    ratio: done / total,
  }
}

export function slicePath(points, t) {
  if (!points?.length) return []
  const end = pointAlongPath(points, t)
  if (!end) return points.slice(0, 1)
  const total = pathLengthKm(points)
  const target = t * total
  const out = [points[0]]
  let walked = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const seg = haversineKm(a.lat, a.lng, b.lat, b.lng)
    if (walked + seg >= target) {
      out.push(end)
      return out
    }
    out.push(b)
    walked += seg
  }
  return points
}

async function readOsrm(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('route http')
  const data = await res.json()
  const geometry = data?.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(geometry) || geometry.length < 2) throw new Error('route empty')

  const raw = geometry.map(([lng, lat]) => ({ lat, lng }))
  const points = densifyPath(raw)
  const km = data.routes[0].distance / 1000
  return {
    points,
    km,
    durationMin: Math.max(1, Math.round(data.routes[0].duration / 60)),
    source: 'osrm',
  }
}

export async function fetchFootRoute(from, to) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  try {
    return await readOsrm(`/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`)
  } catch {
    return readOsrm(
      `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`,
    )
  }
}

export async function loadRunPath(from, to) {
  try {
    return await fetchFootRoute(from, to)
  } catch {
    const points = fallbackPath(from, to)
    const km = pathLengthKm(points)
    return { points, km, durationMin: etaMin(km), source: 'curve' }
  }
}

export function externalMapLinks(from, to, toName) {
  const name = encodeURIComponent(toName || '탈출점')
  return {
    kakao: `https://map.kakao.com/link/to/${name},${to.lat},${to.lng}`,
    naver: `https://map.naver.com/p/directions/${from.lng},${from.lat},출발점,/${to.lng},${to.lat},${name},/-/walk`,
    google: `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking`,
  }
}
