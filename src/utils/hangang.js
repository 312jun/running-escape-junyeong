import { HANGANG_NORTH, HANGANG_SOUTH } from '../data/hangang'
import { HANGANG_STOPS } from '../data/hangangStops'
import { SEOUL_STREAMS } from '../data/streams'
import { SEOUL_SUBWAY_STOPS } from '../data/subwayStops'
import { haversineKm, pointAtTrackKm, snapToTrack, walkTrack } from './geo'
import { isInSeoul, isSeoulStationName } from './seoul'

const MAX_STATION_OFF_KM = 1.2
const MIN_ALONG_KM = 0.3
const STREAM_CANDIDATE_LIMIT = 3
/** 한강이 하천보다 이 비율 이상 길고, 목표의 12%(최소 0.5km) 이상 더 멀면 하천. */
const HANGANG_VS_STREAM_RATIO = 1.4
const HANGANG_VS_STREAM_MIN_EXTRA_KM = 0.5
const HANGANG_VS_STREAM_TARGET_SHARE = 0.12

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

function geoDir(from, to) {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  if (Math.abs(dLng) >= Math.abs(dLat)) return dLng >= 0 ? 'east' : 'west'
  return dLat >= 0 ? 'north' : 'south'
}

export function hangangCourse(from) {
  const { bank, snap, side } = pickHangangBank(from)
  return {
    id: 'hangang',
    name: '한강',
    kind: 'hangang',
    bank,
    snap,
    side,
    approachKm: snap.offTrackKm,
    stops: HANGANG_STOPS.filter((s) => isInSeoul(s.lat, s.lng)),
    maxStationOffKm: MAX_STATION_OFF_KM,
  }
}

function streamCourse(from, stream) {
  const snap = snapToTrack(from.lat, from.lng, stream.track)
  return {
    id: stream.id,
    name: stream.name,
    kind: 'stream',
    bank: stream.track,
    snap,
    side: 'path',
    approachKm: snap.offTrackKm,
    stops: SEOUL_SUBWAY_STOPS.filter((s) => isInSeoul(s.lat, s.lng) && isSeoulStationName(s.name)),
    maxStationOffKm: 0.85,
  }
}

/** 직선 스냅이 막혀 있을 때를 대비해 트랙 위 다른 진입점. */
export function waterAccessSnaps(course, offsetsKm = [0, 0.5, -0.5, 1.0, -1.0]) {
  const { bank, snap } = course || {}
  if (!snap) return []
  if (!bank?.length) return [snap]
  const out = []
  for (const off of offsetsKm) {
    const km = Math.max(0, snap.kmFromStart + off)
    const pt = pointAtTrackKm(bank, km)
    if (!pt || !isInSeoul(pt.lat, pt.lng)) continue
    if (out.some((row) => haversineKm(row.lat, row.lng, pt.lat, pt.lng) < 0.18)) continue
    out.push({
      lat: pt.lat,
      lng: pt.lng,
      kmFromStart: km,
      offTrackKm: Math.abs(off) < 0.05 ? snap.offTrackKm : 0,
    })
  }
  return out.length ? out : [snap]
}

export function nearestStreamCourse(from) {
  let best = null
  for (const stream of SEOUL_STREAMS) {
    const course = streamCourse(from, stream)
    if (!isInSeoul(course.snap.lat, course.snap.lng)) continue
    if (!best || course.approachKm < best.approachKm) best = course
  }
  return best
}

/** 한강·하천 중 직선으로 가장 가까운 물길. 안내 문구용. */
export function nearestWaterCourse(from) {
  if (!from || !isInSeoul(from.lat, from.lng)) return null
  const hangang = hangangCourse(from)
  const stream = nearestStreamCourse(from)
  if (!stream) return hangang
  return stream.approachKm <= hangang.approachKm ? stream : hangang
}

/**
 * 한강 접근이 하천보다 목표 거리 대비 너무 길면 하천을 고른다.
 * approachKm은 직선이 아니라 도보 km를 넣는 것이 맞다.
 */
export function hangangTooFarVsStream(hangangKm, streamKm, targetKm) {
  const hangang = Number(hangangKm)
  const stream = Number(streamKm)
  const target = Math.max(0.5, Number(targetKm) || 0)
  if (!Number.isFinite(hangang) || !Number.isFinite(stream)) return false
  if (hangang >= target && stream < target) return true
  if (stream >= target) return false
  const extra = hangang - stream
  const ratio = hangang / Math.max(stream, 0.12)
  const extraNeed = Math.max(HANGANG_VS_STREAM_MIN_EXTRA_KM, target * HANGANG_VS_STREAM_TARGET_SHARE)
  return extra >= extraNeed && ratio >= HANGANG_VS_STREAM_RATIO
}

/**
 * 목표 km 안에 직선으로 닿는 한강·하천 후보.
 * 직선은 하한이라, 실제 선택은 도보 거리를 잰 뒤 pickRunCourse로 한다.
 */
export function listRunCourseCandidates(from, targetKm) {
  if (!from || !isInSeoul(from.lat, from.lng)) return []
  const target = Math.max(0.5, Number(targetKm) || 0)
  const hangang = hangangCourse(from)
  const streams = []
  for (const stream of SEOUL_STREAMS) {
    const course = streamCourse(from, stream)
    if (!isInSeoul(course.snap.lat, course.snap.lng)) continue
    if (course.approachKm >= target) continue
    streams.push(course)
  }
  streams.sort((a, b) => a.approachKm - b.approachKm)

  const out = []
  if (hangang.approachKm < target) out.push(hangang)
  out.push(...streams.slice(0, STREAM_CANDIDATE_LIMIT))
  return out
}

/**
 * 도보 접근 km가 목표보다 짧은 물길 중 고른다.
 * 한강이 가장 가까운 하천보다 너무 멀면 하천, 아니면 한강.
 * 둘 다 목표 km보다 멀면 null (정류장으로 끊기).
 */
export function pickRunCourse(courses, targetKm) {
  const target = Math.max(0.5, Number(targetKm) || 0)
  const list = Array.isArray(courses) ? courses.filter(Boolean) : []
  const hangang = list.find((course) => course.kind === 'hangang') || null
  const stream =
    list
      .filter((course) => course.kind === 'stream')
      .sort((a, b) => a.approachKm - b.approachKm)[0] || null
  const hangangOk = Boolean(hangang && hangang.approachKm < target)
  const streamOk = Boolean(stream && stream.approachKm < target)

  if (hangangOk && streamOk && hangangTooFarVsStream(hangang.approachKm, stream.approachKm, target)) {
    return stream
  }
  if (hangangOk) return hangang
  if (streamOk) return stream
  return null
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
 * 길찾기 첫 목적지: 강·하천 진입점 하나.
 * 이미 강변 위면 경유 없이 최종 목적지만 간다.
 */
export function hangangVias(from, course = null) {
  if (!from) return []
  const used = course || hangangCourse(from)
  const point = used.snap
  if (haversineKm(from.lat, from.lng, point.lat, point.lng) < 0.08) return []
  return [{ lat: point.lat, lng: point.lng, name: used.name }]
}

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
    course: row.course,
  }
}

function collectRiverExits(from, sign, course) {
  if (!from || !course) return []
  const { bank, snap, side, stops } = course
  const approachKm = Number(course.approachKm) || haversineKm(from.lat, from.lng, snap.lat, snap.lng)
  const maxOff = Number(course.maxStationOffKm) || MAX_STATION_OFF_KM

  return stops
    .filter((stop) => isInSeoul(stop.lat, stop.lng) && isSeoulStationName(stop.name))
    .map((stop) => {
      const at = snapToTrack(stop.lat, stop.lng, bank)
      const along = (at.kmFromStart - snap.kmFromStart) * sign
      const estTotal = approachKm + along + at.offTrackKm
      return {
        stop,
        snap: at,
        along,
        off: at.offTrackKm,
        estTotal,
        dir: geoDir(snap, at),
        side,
        bank,
        startSnap: snap,
        approachKm,
        sameBank: course.kind === 'hangang' ? stop.side === side : true,
        course,
      }
    })
    .filter((row) => row.off <= maxOff && row.along > MIN_ALONG_KM && isInSeoul(row.snap.lat, row.snap.lng))
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

function trackSign(dir) {
  return dir === 'west' || dir === 'south' ? -1 : 1
}

/** 한 방향으로, 목표 전체 km에 가까운 강변 탈출점을 여러 개 고른다. */
export function listRiverExits(from, targetKm, dir, limit = 3, course = null) {
  if (!from || !dir) return []
  const used = course || hangangCourse(from)
  const scored = collectRiverExits(from, trackSign(dir), used)
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
export function listRiverExitsOffset(from, targetKm, bias, limit = 3, course = null) {
  const target = Math.max(0.5, Number(targetKm) || 0)
  const margin = 0.12
  const used = course || hangangCourse(from)
  const scored = [1, -1].flatMap((sign) => collectRiverExits(from, sign, used))
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

export function hangangRunVias(from, to, max = 5, riverEndKm = null, course = null) {
  if (!from || !to) return hangangVias(from, course)
  const used = course || hangangCourse(from)
  const { bank, snap } = used
  const end = snapToTrack(to.lat, to.lng, bank)
  const endKm =
    riverEndKm == null
      ? end.kmFromStart
      : end.kmFromStart >= snap.kmFromStart
        ? Math.max(end.kmFromStart, riverEndKm)
        : Math.min(end.kmFromStart, riverEndKm)
  const pts = walkTrack(bank, snap.kmFromStart, endKm, 0.35)
  const named = pts.map((p, i) => (i === 0 ? { ...p, name: used.name } : p))
  if (named.length <= max) return uniqueKeep(named, 0.12)
  const picked = []
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round((i / (max - 1)) * (named.length - 1))
    picked.push(named[idx])
  }
  return uniqueKeep(picked, 0.12)
}

export function hangangSpineBetween(from, to, riverEndKm = null, course = null) {
  const used = course || hangangCourse(from)
  const { bank, snap: startSnap } = used
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
    course: used,
  }
}

export function hangangSpinePoints(from, to, course = null) {
  const { startSnap, endSnap, points } = hangangSpineBetween(from, to, null, course)
  return uniqueKeep([from, { lat: startSnap.lat, lng: startSnap.lng }, ...points, { lat: endSnap.lat, lng: endSnap.lng }, to])
}

function offToTracks(point, tracks, maxOffKm) {
  let best = Infinity
  for (const track of tracks) {
    const snap = snapToTrack(point.lat, point.lng, track)
    if (snap.offTrackKm < best) best = snap.offTrackKm
  }
  return best <= maxOffKm
}

/** 경로 중 강변(약 400m 안)을 따른 거리 비율 */
export function hangangPathStats(points, maxOffKm = 0.4, course = null) {
  if (!points?.length || points.length < 2) return { hangangKm: 0, totalKm: 0, share: 0 }
  const tracks =
    course?.kind === 'stream' && course.bank
      ? [course.bank]
      : [HANGANG_SOUTH, HANGANG_NORTH]
  let hangangKm = 0
  let totalKm = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const seg = haversineKm(a.lat, a.lng, b.lat, b.lng)
    totalKm += seg
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    if (offToTracks(mid, tracks, maxOffKm)) hangangKm += seg
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
