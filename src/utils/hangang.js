import { HANGANG_NORTH, HANGANG_SOUTH } from '../data/hangang'
import { HANGANG_STOPS } from '../data/hangangStops'
import {
  haversineKm,
  snapToTrack,
  trackLengthKm,
  walkTrack,
} from './geo'

export function pickHangangBank(point) {
  const south = snapToTrack(point.lat, point.lng, HANGANG_SOUTH)
  const north = snapToTrack(point.lat, point.lng, HANGANG_NORTH)
  if (south.offTrackKm <= north.offTrackKm) {
    return { bank: HANGANG_SOUTH, snap: south, side: 'south' }
  }
  return { bank: HANGANG_NORTH, snap: north, side: 'north' }
}

/** 현재 위치에서 가장 가까운 한강 도보 기준점. */
export function nearestHangangPoint(from) {
  const { snap, side } = pickHangangBank(from)
  return {
    lat: snap.lat,
    lng: snap.lng,
    offTrackKm: snap.offTrackKm,
    kmFromStart: snap.kmFromStart,
    side,
  }
}

export function hangangApproachKm(from) {
  const point = nearestHangangPoint(from)
  return haversineKm(from.lat, from.lng, point.lat, point.lng)
}

export function uniqueKeep(points, minKm = 0.06) {
  const out = []
  for (const p of points) {
    if (!p) continue
    const prev = out[out.length - 1]
    if (prev && haversineKm(prev.lat, prev.lng, p.lat, p.lng) < minKm) continue
    out.push({ lat: p.lat, lng: p.lng })
  }
  return out
}

/**
 * 길찾기 첫 목적지: 가장 가까운 한강 도보 기준점 하나.
 * 이미 한강 위면 경유 없이 최종 목적지만 간다.
 */
export function hangangVias(from) {
  if (!from) return []
  const point = nearestHangangPoint(from)
  if (haversineKm(from.lat, from.lng, point.lat, point.lng) < 0.08) return []
  return [{ lat: point.lat, lng: point.lng }]
}

function clampTrackKm(km, total) {
  return Math.max(0.05, Math.min(total - 0.05, km))
}

/**
 * 목표 km의 거의 전부를 한강변에서 채운다.
 * 접근·이탈은 아주 짧게만 빼고, 가까운 역 때문에 강변을 줄이지 않는다.
 */
export function riverTargetKm(targetKm, approachKm) {
  const target = Math.max(0.8, Number(targetKm) || 0)
  const approach = Math.max(0, Number(approachKm) || 0)
  return Math.max(target * 0.97, target - Math.min(approach, 0.1) - 0.06)
}

export function pickRiverExit(from, targetKm, dir) {
  const { bank, snap, side } = pickHangangBank(from)
  const approachKm = haversineKm(from.lat, from.lng, snap.lat, snap.lng)
  const want = riverTargetKm(targetKm, approachKm)
  const total = trackLengthKm(bank)
  const sign = dir === 'west' ? -1 : 1
  const remaining = dir === 'west' ? snap.kmFromStart : total - snap.kmFromStart
  const bounced = remaining < want * 0.9
  const turnKm = bounced
    ? dir === 'west'
      ? 0.05
      : total - 0.05
    : clampTrackKm(snap.kmFromStart + sign * want, total)
  const leftover = bounced ? Math.max(0.2, want - remaining) : 0
  const endKm = bounced
    ? clampTrackKm(turnKm - sign * leftover, total)
    : turnKm

  const scored = HANGANG_STOPS.map((stop) => {
    const at = snapToTrack(stop.lat, stop.lng, bank)
    const along = (at.kmFromStart - snap.kmFromStart) * sign
    return {
      stop,
      snap: at,
      along,
      off: at.offTrackKm,
      gap: Math.abs(at.kmFromStart - endKm),
    }
  }).filter((row) => row.off <= 0.32)

  const sameBank = scored.filter((row) => row.stop.side === side)
  const base = sameBank.length ? sameBank : scored

  const longEnough = base.filter((row) => row.along >= want * 0.95 || bounced)
  const keepGoing = base.filter((row) => row.along >= want * 0.7)
  const pool = (
    longEnough.length ? longEnough : keepGoing.length ? keepGoing : base
  ).sort((a, b) => {
    const aSide = a.stop.side === side ? 0 : 1
    const bSide = b.stop.side === side ? 0 : 1
    if (aSide !== bSide) return aSide - bSide
    if (Math.abs(a.gap - b.gap) > 0.15) return a.gap - b.gap
    return a.off - b.off
  })

  const best = pool[0]
  if (!best) return null

  const riverEndKm = bounced
    ? turnKm
    : sign > 0
      ? Math.max(turnKm, best.snap.kmFromStart)
      : Math.min(turnKm, best.snap.kmFromStart)
  const riverKm = bounced
    ? Math.abs(turnKm - snap.kmFromStart) + Math.abs(turnKm - best.snap.kmFromStart)
    : Math.abs(riverEndKm - snap.kmFromStart)

  return {
    dir,
    side,
    bank,
    startSnap: snap,
    approachKm,
    riverEndKm,
    riverKm,
    stop: best.stop,
  }
}

export function hangangRunVias(from, to, max = 5, riverEndKm = null) {
  if (!from || !to) return hangangVias(from)
  const { bank, snap } = pickHangangBank(from)
  const end = snapToTrack(to.lat, to.lng, bank)
  const endKm =
    riverEndKm == null
      ? end.kmFromStart
      : end.kmFromStart >= snap.kmFromStart
        ? Math.max(end.kmFromStart, riverEndKm)
        : Math.min(end.kmFromStart, riverEndKm)
  const pts = walkTrack(bank, snap.kmFromStart, endKm, 0.35)
  if (pts.length <= max) return uniqueKeep(pts, 0.12)
  const picked = []
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round((i / (max - 1)) * (pts.length - 1))
    picked.push(pts[idx])
  }
  return uniqueKeep(picked, 0.12)
}

export function hangangSpineBetween(from, to, riverEndKm = null) {
  const { bank, snap: startSnap } = pickHangangBank(from)
  const endSnap = snapToTrack(to.lat, to.lng, bank)
  const farKm =
    riverEndKm == null
      ? endSnap.kmFromStart
      : endSnap.kmFromStart >= startSnap.kmFromStart
        ? Math.max(endSnap.kmFromStart, riverEndKm)
        : Math.min(endSnap.kmFromStart, riverEndKm)
  const out = walkTrack(bank, startSnap.kmFromStart, farKm, 0.035)
  const tail =
    Math.abs(farKm - endSnap.kmFromStart) > 0.08
      ? walkTrack(bank, farKm, endSnap.kmFromStart, 0.035)
      : []
  const points = uniqueKeep([...out, ...tail], 0.02)
  return {
    bank,
    startSnap,
    endSnap,
    riverKm: Math.abs(farKm - startSnap.kmFromStart) + Math.abs(farKm - endSnap.kmFromStart),
    points,
  }
}

export function hangangSpinePoints(from, to) {
  const { startSnap, endSnap, points } = hangangSpineBetween(from, to)
  return uniqueKeep([from, { lat: startSnap.lat, lng: startSnap.lng }, ...points, { lat: endSnap.lat, lng: endSnap.lng }, to])
}

/** 경로 중 한강변(약 400m 안)을 따른 거리 비율 */
export function hangangPathStats(points, maxOffKm = 0.4) {
  if (!points?.length || points.length < 2) return { hangangKm: 0, totalKm: 0, share: 0 }
  let hangangKm = 0
  let totalKm = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const seg = haversineKm(a.lat, a.lng, b.lat, b.lng)
    totalKm += seg
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    const south = snapToTrack(mid.lat, mid.lng, HANGANG_SOUTH)
    const north = snapToTrack(mid.lat, mid.lng, HANGANG_NORTH)
    if (Math.min(south.offTrackKm, north.offTrackKm) <= maxOffKm) hangangKm += seg
  }
  return { hangangKm, totalKm, share: totalKm > 0 ? hangangKm / totalKm : 0 }
}

export function routeTouchesHangang(points, maxOffKm = 0.28) {
  if (!points?.length) return false
  const step = Math.max(1, Math.floor(points.length / 40))
  for (let i = 0; i < points.length; i += step) {
    const p = points[i]
    const south = snapToTrack(p.lat, p.lng, HANGANG_SOUTH)
    const north = snapToTrack(p.lat, p.lng, HANGANG_NORTH)
    if (Math.min(south.offTrackKm, north.offTrackKm) <= maxOffKm) return true
  }
  return false
}
