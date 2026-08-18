import { askEscapePlan, askGeminiChooseRoute } from './askGemini'
import {
  hangangRunVias,
  listRiverExits,
  listRiverExitsOffset,
  listRunCourseCandidates,
  nearestWaterCourse,
  pickRunCourse,
  waterAccessSnaps,
} from './hangang'
import { formatKm, haversineKm } from './geo'
import { composeHangangRoute, loadRunPath, streetLeg } from './route'
import { nearestBusStop } from './seoul'

function fitScore(runKm, targetKm) {
  const ratio = targetKm > 0 ? Number(runKm) / targetKm : 99
  if (ratio >= 0.85 && ratio <= 1.2) return 0
  if (ratio >= 0.7 && ratio <= 1.3) return 1
  if (ratio >= 0.55 && ratio < 0.7) return 3
  if (ratio > 1.3 && ratio <= 1.45) return 3
  if (ratio < 0.55) return 4
  return 5
}

function betterOrCloseFit(cand, chosen, targetKm) {
  const fitC = fitScore(cand.runKm, targetKm)
  const fitN = fitScore(chosen.runKm, targetKm)
  if (fitC < fitN) return true
  if (fitC > fitN) return false
  return Math.abs(Number(cand.runKm) - targetKm) <= Math.abs(Number(chosen.runKm) - targetKm) + 0.2
}

function closestToTarget(rows, targetKm) {
  return [...rows].sort((a, b) => {
    const fitA = fitScore(a.runKm, targetKm)
    const fitB = fitScore(b.runKm, targetKm)
    if (fitA !== fitB) return fitA - fitB
    const dA = Math.abs(Number(a.runKm) - targetKm)
    const dB = Math.abs(Number(b.runKm) - targetKm)
    if (Math.abs(dA - dB) > 0.25) return dA - dB
    const shareA = Number(a.route?.hangangShare) || 0
    const shareB = Number(b.route?.hangangShare) || 0
    if (Math.abs(shareA - shareB) > 0.08) return shareB - shareA
    return dA - dB
  })[0]
}

function waterLabel(course) {
  return course?.name || '한강'
}

function waterPoint(course) {
  if (!course?.snap) return null
  return {
    lat: course.snap.lat,
    lng: course.snap.lng,
    offTrackKm: course.approachKm,
    side: course.side,
  }
}

async function walkToSnap(entry, snap) {
  try {
    return await streetLeg(entry, { lat: snap.lat, lng: snap.lng })
  } catch {
    return null
  }
}

async function withWalkApproach(entry, course) {
  const straight = Number(course.approachKm) || 0
  const primary = await walkToSnap(entry, course.snap)
  let bestSnap = course.snap
  let bestLeg = primary
  let bestKm = primary?.km

  const blocked = Number.isFinite(bestKm) && bestKm > straight * 1.65 + 0.2
  if (blocked) {
    const extras = waterAccessSnaps(course, [0.5, -0.5, 1.0, -1.0]).filter(
      (snap) => haversineKm(snap.lat, snap.lng, course.snap.lat, course.snap.lng) > 0.18,
    )
    const tried = await Promise.all(extras.map(async (snap) => ({ snap, inLeg: await walkToSnap(entry, snap) })))
    for (const row of tried) {
      const km = row.inLeg?.km
      if (!Number.isFinite(km)) continue
      if (!Number.isFinite(bestKm) || km + 0.08 < bestKm) {
        bestKm = km
        bestSnap = row.snap
        bestLeg = row.inLeg
      }
    }
  }

  if (!Number.isFinite(bestKm)) return { ...course, inLeg: null }
  return {
    ...course,
    snap: bestSnap,
    approachKm: bestKm,
    inLeg: bestLeg,
  }
}

async function planNearestStop({ entry, targetKm, weather, toHangangKm, hangang, waterwayName }) {
  let bus = null
  try {
    bus = await nearestBusStop(entry.lat, entry.lng)
  } catch {
    bus = null
  }

  const draft = await askEscapePlan({
    entry,
    targetKm,
    weather,
    skipHangang: true,
    toHangangKm,
    hangang,
    waterwayName: waterwayName || '한강',
  }).catch(() => null)

  const dest = bus?.coords || draft?.coords
  if (!dest) {
    return (
      draft || {
        blocked: true,
        reason: '가까운 정류장을 찾지 못했어요. 위치를 조금 옮겨 보세요.',
      }
    )
  }

  const route = await loadRunPath(entry, dest, [], { hangang: false })
  const name = bus?.name || draft?.name || '가까운 정류장'
  const river = waterwayName || '한강'

  return {
    blocked: false,
    name,
    type: 'bus',
    lines: bus?.lines || draft?.lines || ['버스'],
    runKm: route.km,
    dir: draft?.dir || 'east',
    pathOk: true,
    pathNote: `${river}까지 ${formatKm(toHangangKm)}라 목표 ${targetKm}km보다 멀어요. 가까운 정류장으로 안내합니다.`,
    hint: `${river} 대신 가까운 정류장`,
    reason: `${river} 진입점이 목표 거리보다 멀어 ${name}으로 끊습니다.`,
    briefing:
      draft?.briefing ||
      `가장 가까운 ${river}까지 ${formatKm(toHangangKm)}입니다. 선택한 ${targetKm}km보다 멀어서 ${river} 대신 가까운 정류장으로 안내합니다.`,
    weatherNote: draft?.weatherNote || '',
    eventNote: draft?.eventNote || '',
    coords: dest,
    vias: [],
    skipHangang: true,
    waterwayName: river,
    route: { ...route, viaHangang: false, judgedByGemini: Boolean(draft) },
    alternates: [],
  }
}

async function measureHangangStop(entry, stop, dir, riverEndKm, course, inLeg) {
  const route = await composeHangangRoute(
    entry,
    { lat: stop.lat, lng: stop.lng },
    { riverEndKm, course, inLeg },
  )
  const share = Number(route.hangangShare) || 0
  const label = waterLabel(course)
  return {
    name: stop.name,
    type: stop.type || 'subway',
    lines: stop.lines || ['지하철'],
    coords: { lat: stop.lat, lng: stop.lng },
    dir,
    runKm: route.km,
    pathOk: share >= 0.55 || Number(route.hangangKm) >= 1,
    pathNote: `${label} ${formatKm(route.hangangKm)} · 전체 ${formatKm(route.km)}`,
    hint: `${label} ${formatKm(route.hangangKm)}`,
    vias: route.vias || hangangRunVias(entry, { lat: stop.lat, lng: stop.lng }, 5, riverEndKm, course),
    waterwayName: label,
    route: { ...route, viaHangang: true, waterwayName: label, judgedByGemini: false },
  }
}

export async function planEscapeRun({ entry, targetKm, weather }) {
  const target = Number(targetKm)
  const shortlist = listRunCourseCandidates(entry, target)
  const measured = shortlist.length
    ? await Promise.all(shortlist.map((course) => withWalkApproach(entry, course)))
    : []

  const course = pickRunCourse(measured, target)
  if (!course) {
    const fallback = measured.length
      ? [...measured].sort((a, b) => a.approachKm - b.approachKm)[0]
      : nearestWaterCourse(entry)
    return planNearestStop({
      entry,
      targetKm,
      weather,
      toHangangKm: fallback?.approachKm ?? 0,
      hangang: waterPoint(fallback),
      waterwayName: waterLabel(fallback),
    })
  }

  const inLeg = course.inLeg || null
  const toWaterKm = course.approachKm
  const hangang = waterPoint(course)
  const label = waterLabel(course)
  const exits = ['east', 'west']
    .flatMap((dir) => listRiverExits(entry, target, dir, 3, course))
    .filter((exit, i, arr) => arr.findIndex((row) => row.stop.name === exit.stop.name) === i)
  const mainNames = new Set(exits.map((exit) => exit.stop.name))
  const spreadExits = ['short', 'long']
    .flatMap((bias) => listRiverExitsOffset(entry, target, bias, 2, course))
    .filter((exit, i, arr) => {
      if (mainNames.has(exit.stop.name)) return false
      return arr.findIndex((row) => row.stop.name === exit.stop.name) === i
    })

  const measuredRows = (
    await Promise.all(
      [...exits, ...spreadExits].map(async (exit) => {
        try {
          const measured = await measureHangangStop(
            entry,
            exit.stop,
            exit.dir,
            exit.riverEndKm,
            course,
            inLeg,
          )
          return { ...measured, spreadOnly: !mainNames.has(exit.stop.name) }
        } catch {
          return null
        }
      }),
    )
  ).filter(Boolean)

  const measuredMain = measuredRows.filter((row) => !row.spreadOnly)
  const fitted = measuredMain.filter((row) => fitScore(row.runKm, target) <= 3)
  const pool = fitted.length ? fitted : measuredMain
  const spreadPool = measuredRows

  const draft = await askEscapePlan({
    entry,
    targetKm,
    weather,
    skipHangang: false,
    toHangangKm: toWaterKm,
    hangang,
    waterwayName: label,
    candidates: pool,
  }).catch(() => null)

  if (!pool.length) {
    return (
      draft || {
        blocked: true,
        reason: `${label}을 따라 목표 거리에 맞는 탈출점을 못 찾았어요.`,
      }
    )
  }

  let chosen = closestToTarget(pool, targetKm)
  try {
    const decision = await askGeminiChooseRoute({ targetKm, options: pool, waterwayName: label })
    const byName = decision?.name
      ? pool.find((row) => row.name === String(decision.name).trim())
      : null
    const byIndex =
      Number.isFinite(Number(decision?.pick)) && pool[Number(decision.pick) - 1]
        ? pool[Number(decision.pick) - 1]
        : null
    if (byName || byIndex) {
      const cand = byName || byIndex
      if (betterOrCloseFit(cand, chosen, targetKm)) {
        chosen = cand
        if (decision.reason) chosen = { ...chosen, reason: String(decision.reason).slice(0, 240) }
      }
    }
  } catch {
    // 강변 거리로만 고른다
  }

  if (draft?.name) {
    const geminiMatch = pool.find((row) => row.name === draft.name)
    if (geminiMatch && betterOrCloseFit(geminiMatch, chosen, targetKm)) {
      chosen = {
        ...geminiMatch,
        reason: chosen.reason || draft.reason,
      }
    }
  }

  const { spreadOnly: _spreadOnly, ...picked } = chosen
  chosen = {
    ...picked,
    kind: 'main',
    skipHangang: false,
    waterwayName: label,
    briefing: draft?.briefing || chosen.briefing,
    weatherNote: draft?.weatherNote || '',
    eventNote: draft?.eventNote || '',
    reason:
      chosen.reason ||
      draft?.reason ||
      `${label}을 따라 ${formatKm(chosen.route.hangangKm)} 뛴 뒤 ${chosen.name}에서 끊습니다.`,
    route: { ...chosen.route, judgedByGemini: true, waterwayName: label },
  }

  const alternates = pickSpreadAlts(spreadPool, chosen, target)

  return {
    ...(draft || {}),
    ...chosen,
    vias: chosen.vias,
    skipHangang: false,
    waterwayName: label,
    alternates,
  }
}

function toAlt(row, kind) {
  return {
    kind,
    name: row.name,
    type: row.type,
    lines: row.lines,
    runKm: row.runKm,
    dir: row.dir,
    pathOk: row.pathOk,
    hint: row.hint || row.pathNote,
    pathNote: row.pathNote || row.hint,
    coords: row.coords,
    vias: row.vias,
    waterwayName: row.waterwayName,
    route: row.route,
  }
}

function bestSpread(rows, chosen, targetKm, side) {
  const chosenKm = Number(chosen.runKm)
  const target = Number(targetKm)
  const others = rows.filter((row) => row.name !== chosen.name)
  if (side === 'short') {
    const cap = Math.min(chosenKm, target)
    return others
      .filter((row) => Number(row.runKm) < cap - 0.15)
      .sort((a, b) => Number(b.runKm) - Number(a.runKm))[0]
  }
  const floor = Math.max(chosenKm, target)
  return others
    .filter((row) => Number(row.runKm) > floor + 0.15)
    .sort((a, b) => Number(a.runKm) - Number(b.runKm))[0]
}

function pickSpreadAlts(rows, chosen, targetKm) {
  const shorter = bestSpread(rows, chosen, targetKm, 'short')
  const longer = bestSpread(rows, chosen, targetKm, 'long')
  const out = []
  if (shorter) out.push(toAlt(shorter, 'short'))
  if (longer) out.push(toAlt(longer, 'long'))
  return out
}
