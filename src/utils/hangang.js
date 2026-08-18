import { HANGANG_NORTH, HANGANG_SOUTH } from '../data/hangang'
import { HANGANG_STOPS } from '../data/hangangStops'
import { haversineKm, snapToTrack, walkTrack } from './geo'

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

const MAX_STATION_OFF_KM = 1.2
const MIN_ALONG_KM = 0.3

/**
 * 한강변에서 채울 거리. 접근·역까지 이탈을 빼서 전체 코스가 목표 km에 맞게 한다.
 */
export function riverTargetKm(targetKm, approachKm, exitKm = 0.15) {
  const target = Math.max(0.5, Number(targetKm) || 0)
  const overhead = Math.max(0, Number(approachKm) || 0) + Math.max(0, Number(exitKm) || 0)
  return Math.max(0.3, target - overhead)
}

function distanceFitScore(km, targetKm) {
  const ratio = targetKm > 0 ? Number(km) / targetKm : 99
  if (ratio >= 0.85 && ratio <= 1.2) return 0
  if (ratio >= 0.7 && ratio <= 1.3) return 1
  if (ratio >= 0.55 && ratio < 0.7) return 3
  if (ratio > 1.3 && ratio <= 1.45) return 3
  if (ratio < 0.55) return 4
  return 5
}

function toExit(row) {
  return {
    dir: row.dir,
    side: row.side,
    bank: row.bank,
    startSnap: row.startSnap,
    approachKm: row.approachKm,
    riverEndKm: row.snap.kmFromStart,
    riverKm: row.along,
    estTotal: row.estTotal,
    stop: row.stop,
  }
}

function collectRiverExits(from, dir) {
  if (!from || !dir) return []
  const { bank, snap, side } = pickHangangBank(from)
  const approachKm = haversineKm(from.lat, from.lng, snap.lat, snap.lng)
  const sign = dir === 'west' ? -1 : 1

  return HANGANG_STOPS.map((stop) => {
    const at = snapToTrack(stop.lat, stop.lng, bank)
    const along = (at.kmFromStart - snap.kmFromStart) * sign
    const estTotal = approachKm + along + at.offTrackKm
    return {
      stop,
      snap: at,
      along,
      off: at.offTrackKm,
      estTotal,
      dir,
      side,
      bank,
      startSnap: snap,
      approachKm,
      sameBank: stop.side === side,
    }
  }).filter((row) => row.off <= MAX_STATION_OFF_KM && row.along > MIN_ALONG_KM)
}

function uniqExits(rows, limit) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    if (seen.has(row.stop.name)) continue
    seen.add(row.stop.name)
    out.push(toExit(row))
    if (out.length >= limit) break
  }
  return out
}

/** 한 방향으로, 목표 전체 km에 가까운 강변 탈출점을 여러 개 고른다. */
export function listRiverExits(from, targetKm, dir, limit = 3) {
  if (!from || !dir) return []
  const scored = collectRiverExits(from, dir)
  if (!scored.length) return []

  const target = Math.max(0.5, Number(targetKm) || 0)
  const want = riverTargetKm(target, scored[0].approachKm)
  const sameBank = scored.filter((row) => row.sameBank)
  const okFit = (rows) => rows.filter((row) => distanceFitScore(row.estTotal, target) <= 3)
  let base = sameBank.length ? sameBank : scored
  const fitted = okFit(base)
  if (fitted.length) base = fitted
  else {
    const anyFit = okFit(scored)
    if (anyFit.length) base = anyFit
  }

  base.sort((a, b) => {
    const fitA = distanceFitScore(a.estTotal, target)
    const fitB = distanceFitScore(b.estTotal, target)
    if (fitA !== fitB) return fitA - fitB
    const dA = Math.abs(a.estTotal - target)
    const dB = Math.abs(b.estTotal - target)
    if (Math.abs(dA - dB) > 0.15) return dA - dB
    if (a.sameBank !== b.sameBank) return a.sameBank ? -1 : 1
    if (Math.abs(a.off - b.off) > 0.2) return a.off - b.off
    return Math.abs(a.along - want) - Math.abs(b.along - want)
  })

  return uniqExits(base, limit)
}

/** 목표보다 짧거나 긴 탈출점. 대표 추천 정렬과는 별개. */
export function listRiverExitsOffset(from, targetKm, bias, limit = 3) {
  const target = Math.max(0.5, Number(targetKm) || 0)
  const margin = 0.12
  const scored = ['east', 'west'].flatMap((dir) => collectRiverExits(from, dir))
  const sideRows =
    bias === 'short'
      ? scored.filter((row) => row.estTotal < target - margin)
      : scored.filter((row) => row.estTotal > target + margin)

  sideRows.sort((a, b) => {
    if (a.sameBank !== b.sameBank) return a.sameBank ? -1 : 1
    const dA = Math.abs(a.estTotal - target)
    const dB = Math.abs(b.estTotal - target)
    if (Math.abs(dA - dB) > 0.1) return dA - dB
    return a.off - b.off
  })

  return uniqExits(sideRows, limit)
}

export function pickRiverExit(from, targetKm, dir) {
  return listRiverExits(from, targetKm, dir, 1)[0] || null
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
