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

/** 한강변 트랙 위에서, 시작점으로부터의 거리와 트랙까지 떨어진 거리 */
export function locateOnTrack(lat, lng, track) {
  if (!track?.length) {
    return { kmFromStart: 0, offTrackKm: 0 }
  }

  const originLat = track[0].lat
  const point = toXY(lat, lng, originLat)
  const nodes = track.map((node) => toXY(node.lat, node.lng, originLat))

  let best = { dist: Infinity, kmFromStart: 0 }
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
      best = { dist, kmFromStart: walked + t * len }
    }
    walked += len
  }

  const last = nodes[nodes.length - 1]
  const tail = hypot(point.x - last.x, point.y - last.y)
  if (tail < best.dist) {
    best = { dist: tail, kmFromStart: walked }
  }

  return { kmFromStart: best.kmFromStart, offTrackKm: best.dist }
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
