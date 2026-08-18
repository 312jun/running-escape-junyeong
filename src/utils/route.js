import { haversineKm, locateOnTrack } from './geo'
import {
  hangangCourse,
  hangangPathStats,
  hangangRunVias,
  hangangSpineBetween,
  hangangSpinePoints,
  uniqueKeep,
} from './hangang'

const PACE_MIN_PER_KM = 6

export function etaMin(km) {
  if (!Number.isFinite(km) || km <= 0) return 1
  return Math.max(1, Math.round(km * PACE_MIN_PER_KM))
}

export function naverWalkUrl(from, to, vias = [], names = {}) {
  const place = (point, name) =>
    `${point.lng},${point.lat},${encodeURIComponent(name)},PLACE`

  const start = place(from, names.from || '출발')
  const goal = place(to, names.to || '도착')
  const via = vias?.length
    ? vias
        .map((p, i) => place(p, i === 0 ? names.via || p.name || '강변' : `경유${i + 1}`))
        .join(':')
    : '-'

  return `https://map.naver.com/p/directions/${start}/${goal}/${via}/walk`
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

function viaQuery(vias) {
  if (!vias?.length) return ''
  return `&via=${vias.map((p) => `${p.lat},${p.lng}`).join('|')}`
}

async function readWalkingApi(from, to, vias, street = false) {
  const streetQ = street ? '&street=1' : ''
  const res = await fetch(
    `/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${viaQuery(vias)}${streetQ}`,
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !Array.isArray(data.points) || data.points.length < 2) {
    throw new Error(data.error || 'route empty')
  }
  return {
    points: densifyPath(data.points),
    km: Number(data.km) || pathLengthKm(data.points),
    durationMin: Number(data.durationMin) || etaMin(Number(data.km) || pathLengthKm(data.points)),
    source: data.source || 'walk',
  }
}

export async function fetchFootRoute(from, to, vias = [], street = false) {
  const routed = await readWalkingApi(from, to, vias, street)
  return {
    ...routed,
    vias,
    viaHangang: vias.length > 0,
  }
}

const streetCache = new Map()

/** 시내 접근·이탈: 직선이 아니라 도로를 따른 도보. */
export async function streetLeg(from, to) {
  const straight = haversineKm(from.lat, from.lng, to.lat, to.lng)
  if (straight < 0.1) {
    const points = densifyPath([from, to], 0.025)
    return { points, km: pathLengthKm(points) }
  }

  const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`
  const hit = streetCache.get(key)
  if (hit) return hit

  const pending = fetchFootRoute(from, to, [], true)
    .then((routed) => {
      const km = Number(routed.km) || pathLengthKm(routed.points)
      const result = { points: routed.points, km }
      streetCache.set(key, result)
      return result
    })
    .catch(() => {
      streetCache.delete(key)
      const points = densifyPath([from, to], 0.025)
      return { points, km: pathLengthKm(points) }
    })

  streetCache.set(key, pending)
  return pending
}

function joinLegs(parts) {
  return uniqueKeep(
    parts.flatMap((part) => part || []),
    0.02,
  )
}

/** 강변을 본길로 고정. 시내 접근·이탈은 도로 도보, 강변은 트랙. */
export async function composeHangangRoute(from, to, opts = {}) {
  const course = opts.course || hangangCourse(from)
  const { startSnap, endSnap, riverKm, points: spine } = hangangSpineBetween(
    from,
    to,
    opts.riverEndKm,
    course,
  )
  const inLeg = opts.inLeg?.points ? opts.inLeg : await streetLeg(from, startSnap)
  const outOff = haversineKm(endSnap.lat, endSnap.lng, to.lat, to.lng)
  const outLeg =
    outOff < 0.12
      ? { points: densifyPath([endSnap, to], 0.025), km: outOff }
      : await streetLeg(endSnap, to)

  const points = joinLegs([inLeg.points, spine, outLeg.points])
  const km = pathLengthKm(points)
  const stats = hangangPathStats(points, 0.4, course)
  const vias = hangangRunVias(from, to, 5, opts.riverEndKm, course)

  return {
    points,
    km,
    durationMin: etaMin(km),
    source: course.kind === 'stream' ? 'stream' : 'hangang',
    viaHangang: true,
    waterwayName: course.name,
    hangangKm: Math.max(stats.hangangKm, riverKm),
    hangangShare: stats.share,
    vias,
  }
}

export async function loadRunPath(from, to, vias = [], opts = {}) {
  const alongHangang = opts.hangang !== false && (opts.hangang || vias.length > 0)
  if (alongHangang) {
    try {
      return await composeHangangRoute(from, to, opts)
    } catch {
      const course = opts.course || hangangCourse(from)
      const points = densifyPath(hangangSpinePoints(from, to, course))
      const km = pathLengthKm(points)
      const stats = hangangPathStats(points, 0.4, course)
      return {
        points,
        km,
        durationMin: etaMin(km),
        source: course.kind === 'stream' ? 'stream' : 'hangang',
        viaHangang: true,
        waterwayName: course.name,
        hangangKm: stats.hangangKm,
        hangangShare: stats.share,
        vias: hangangRunVias(from, to, 5, opts.riverEndKm, course),
      }
    }
  }

  try {
    return await fetchFootRoute(from, to, vias)
  } catch {
    const points = fallbackPath(from, to)
    const km = pathLengthKm(points)
    return {
      points,
      km,
      durationMin: etaMin(km),
      source: 'straight',
      viaHangang: false,
      vias,
    }
  }
}
