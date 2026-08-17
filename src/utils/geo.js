const EARTH_KM = 6371

function toRad(deg) {
  return (deg * Math.PI) / 180
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

function toXY(lat, lng, originLat) {
  return {
    x: toRad(lng) * Math.cos(toRad(originLat)) * EARTH_KM,
    y: toRad(lat) * EARTH_KM,
  }
}

function hypot(dx, dy) {
  return Math.sqrt(dx * dx + dy * dy)
}

/** 한강변 트랙 위 가장 가까운 점 */
export function snapToTrack(lat, lng, track) {
  if (!track?.length) {
    return { kmFromStart: 0, offTrackKm: 0, lat, lng }
  }

  const originLat = track[0].lat
  const point = toXY(lat, lng, originLat)
  const nodes = track.map((node) => toXY(node.lat, node.lng, originLat))

  let best = {
    dist: Infinity,
    kmFromStart: 0,
    lat: track[0].lat,
    lng: track[0].lng,
  }
  let walked = 0

  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i]
    const b = nodes[i + 1]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len = hypot(vx, vy)
    const len2 = len * len
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / len2))
    const px = a.x + t * vx
    const py = a.y + t * vy
    const dist = hypot(point.x - px, point.y - py)

    if (dist < best.dist) {
      best = {
        dist,
        kmFromStart: walked + t * len,
        lat: track[i].lat + t * (track[i + 1].lat - track[i].lat),
        lng: track[i].lng + t * (track[i + 1].lng - track[i].lng),
      }
    }
    walked += len
  }

  const last = nodes[nodes.length - 1]
  const tail = hypot(point.x - last.x, point.y - last.y)
  if (tail < best.dist) {
    const end = track[track.length - 1]
    best = { dist: tail, kmFromStart: walked, lat: end.lat, lng: end.lng }
  }

  return { kmFromStart: best.kmFromStart, offTrackKm: best.dist, lat: best.lat, lng: best.lng }
}

export function trackLengthKm(track) {
  if (!track?.length || track.length < 2) return 0
  let km = 0
  for (let i = 0; i < track.length - 1; i += 1) {
    km += haversineKm(track[i].lat, track[i].lng, track[i + 1].lat, track[i + 1].lng)
  }
  return km
}

/** 한강 트랙을 따라 fromKm → toKm. 직선 지름길이 아니라 강변 폴리라인. */
export function walkTrack(track, fromKm, toKm, stepKm = 0.035) {
  if (!track?.length) return []
  const start = Math.max(0, Number(fromKm) || 0)
  const end = Math.max(0, Number(toKm) || 0)
  const dist = Math.abs(end - start)
  if (dist < 0.03) {
    const a = pointAtTrackKm(track, start)
    const b = pointAtTrackKm(track, end)
    return [a, b].filter(Boolean)
  }
  const steps = Math.max(2, Math.ceil(dist / Math.max(0.02, stepKm)))
  const sign = end >= start ? 1 : -1
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const km = start + sign * (dist * i) / steps
    const pt = pointAtTrackKm(track, km)
    if (pt) points.push({ lat: pt.lat, lng: pt.lng })
  }
  return points
}

export function pointAtTrackKm(track, targetKm) {
  if (!track?.length) return null
  if (track.length === 1) return { lat: track[0].lat, lng: track[0].lng }

  const originLat = track[0].lat
  const nodes = track.map((node) => toXY(node.lat, node.lng, originLat))
  const goal = Math.max(0, Number(targetKm) || 0)
  let walked = 0

  for (let i = 0; i < nodes.length - 1; i += 1) {
    const len = hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y)
    if (walked + len >= goal || i === nodes.length - 2) {
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, (goal - walked) / len))
      return {
        lat: track[i].lat + t * (track[i + 1].lat - track[i].lat),
        lng: track[i].lng + t * (track[i + 1].lng - track[i].lng),
      }
    }
    walked += len
  }

  const end = track[track.length - 1]
  return { lat: end.lat, lng: end.lng }
}

export function sliceTrack(track, fromKm, toKm) {
  if (!track?.length) return []
  const start = pointAtTrackKm(track, fromKm)
  const end = pointAtTrackKm(track, toKm)
  if (!start || !end) return []
  if (Math.abs(toKm - fromKm) < 0.04) return [start, end]

  const lo = Math.min(fromKm, toKm)
  const hi = Math.max(fromKm, toKm)
  const originLat = track[0].lat
  const inner = []
  let walked = 0

  for (let i = 0; i < track.length; i += 1) {
    if (i > 0) {
      const a = toXY(track[i - 1].lat, track[i - 1].lng, originLat)
      const b = toXY(track[i].lat, track[i].lng, originLat)
      walked += hypot(b.x - a.x, b.y - a.y)
    }
    if (walked > lo + 0.02 && walked < hi - 0.02) {
      inner.push({ lat: track[i].lat, lng: track[i].lng })
    }
  }

  const forward = [start, ...inner, end]
  return fromKm <= toKm ? forward : [...forward].reverse()
}

/** 한강변 트랙 위에서, 시작점으로부터의 거리와 트랙까지 떨어진 거리 */
export function locateOnTrack(lat, lng, track) {
  const snap = snapToTrack(lat, lng, track)
  return { kmFromStart: snap.kmFromStart, offTrackKm: snap.offTrackKm }
}

/** 진입점에서 탈출점까지, 한강변을 따라 뛰는 거리 */
export function runKmToStop(from, stop, track) {
  if (!track?.length) {
    return haversineKm(from.lat, from.lng, stop.lat, stop.lng)
  }

  const start = locateOnTrack(from.lat, from.lng, track)
  const at = locateOnTrack(stop.lat, stop.lng, track)
  return Math.abs(at.kmFromStart - start.kmFromStart) + start.offTrackKm + at.offTrackKm
}

export function formatKm(km) {
  if (km < 0.1) return '100m 안쪽'
  if (km < 1) return `${Math.round(km * 1000)}m`
  const rounded = Math.round(km * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}km` : `${rounded.toFixed(1)}km`
}

export function dirLabel(dir) {
  if (dir === 'east') return '동쪽'
  if (dir === 'west') return '서쪽'
  return '바로 옆'
}

/**
 * 뛰고 싶은 km에 가장 가까운 탈출점부터 정렬.
 * 직선거리가 아니라 한강변 트랙을 따른 거리.
 */
export function rankEscapes(from, stops, targetKm, track) {
  if (!from || !stops?.length) return []

  const start = track?.length ? locateOnTrack(from.lat, from.lng, track) : null

  return stops
    .map((stop) => {
      const km = runKmToStop(from, stop, track)
      let dir = 'here'
      if (start && track?.length) {
        const at = locateOnTrack(stop.lat, stop.lng, track)
        if (Math.abs(at.kmFromStart - start.kmFromStart) >= 0.15) {
          dir = at.kmFromStart >= start.kmFromStart ? 'east' : 'west'
        }
      }
      return { stop, km, delta: Math.abs(km - targetKm), dir }
    })
    .sort((a, b) => a.delta - b.delta || a.km - b.km)
}

export function matchEscape(from, stops, targetKm, track) {
  return rankEscapes(from, stops, targetKm, track)[0] ?? null
}
