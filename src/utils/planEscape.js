import { askEscapePlan, askGeminiChooseRoute } from './askGemini'
import {
  hangangApproachKm,
  hangangRunVias,
  listRiverExits,
  listRiverExitsOffset,
  nearestHangangPoint,
} from './hangang'
import { formatKm } from './geo'
import { composeHangangRoute, loadRunPath } from './route'
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

async function planNearestStop({ entry, targetKm, weather, toHangangKm, hangang }) {
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

  return {
    blocked: false,
    name,
    type: 'bus',
    lines: bus?.lines || draft?.lines || ['버스'],
    runKm: route.km,
    dir: draft?.dir || 'east',
    pathOk: true,
    pathNote: `한강까지 ${formatKm(toHangangKm)}라 목표 ${targetKm}km보다 멀어요. 가까운 정류장으로 안내합니다.`,
    hint: '한강 대신 가까운 정류장',
    reason: `한강 진입점이 목표 거리보다 멀어 ${name}으로 끊습니다.`,
    briefing:
      draft?.briefing ||
      `가장 가까운 한강까지 ${formatKm(toHangangKm)}입니다. 선택한 ${targetKm}km보다 멀어서 한강 대신 가까운 정류장으로 안내합니다.`,
    weatherNote: draft?.weatherNote || '',
    eventNote: draft?.eventNote || '',
    coords: dest,
    vias: [],
    skipHangang: true,
    route: { ...route, viaHangang: false, judgedByGemini: Boolean(draft) },
    alternates: [],
  }
}

async function measureHangangStop(entry, stop, dir, riverEndKm) {
  const route = await composeHangangRoute(entry, { lat: stop.lat, lng: stop.lng }, { riverEndKm })
  const share = Number(route.hangangShare) || 0
  return {
    name: stop.name,
    type: stop.type || 'subway',
    lines: stop.lines || ['지하철'],
    coords: { lat: stop.lat, lng: stop.lng },
    dir,
    runKm: route.km,
    pathOk: share >= 0.55 || Number(route.hangangKm) >= 1,
    pathNote: `한강변 ${formatKm(route.hangangKm)} · 전체 ${formatKm(route.km)}`,
    hint: `한강변 ${formatKm(route.hangangKm)}`,
    vias: route.vias || hangangRunVias(entry, { lat: stop.lat, lng: stop.lng }, 5, riverEndKm),
    route: { ...route, viaHangang: true, judgedByGemini: false },
  }
}

export async function planEscapeRun({ entry, targetKm, weather }) {
  const hangang = nearestHangangPoint(entry)
  const toHangangKm = hangangApproachKm(entry)
  const skipHangang = toHangangKm >= Number(targetKm)

  if (skipHangang) {
    return planNearestStop({ entry, targetKm, weather, toHangangKm, hangang })
  }

  const target = Number(targetKm)
  const exits = ['east', 'west']
    .flatMap((dir) => listRiverExits(entry, target, dir, 3))
    .filter((exit, i, arr) => arr.findIndex((row) => row.stop.name === exit.stop.name) === i)
  const mainNames = new Set(exits.map((exit) => exit.stop.name))
  const spreadExits = ['short', 'long']
    .flatMap((bias) => listRiverExitsOffset(entry, target, bias, 2))
    .filter((exit, i, arr) => {
      if (mainNames.has(exit.stop.name)) return false
      return arr.findIndex((row) => row.stop.name === exit.stop.name) === i
    })

  const measuredRows = (
    await Promise.all(
      [...exits, ...spreadExits].map(async (exit) => {
        try {
          const measured = await measureHangangStop(entry, exit.stop, exit.dir, exit.riverEndKm)
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
    toHangangKm,
    hangang,
    candidates: pool,
  }).catch(() => null)

  if (!pool.length) {
    return (
      draft || {
        blocked: true,
        reason: '한강변을 따라 목표 거리에 맞는 탈출점을 못 찾았어요.',
      }
    )
  }

  let chosen = closestToTarget(pool, targetKm)
  try {
    const decision = await askGeminiChooseRoute({ targetKm, options: pool })
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
    // 한강변 거리로만 고른다
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
    briefing: draft?.briefing || chosen.briefing,
    weatherNote: draft?.weatherNote || '',
    eventNote: draft?.eventNote || '',
    reason: chosen.reason || draft?.reason || `한강변을 따라 ${formatKm(chosen.route.hangangKm)} 뛴 뒤 ${chosen.name}에서 끊습니다.`,
    route: { ...chosen.route, judgedByGemini: true },
  }

  const alternates = pickSpreadAlts(spreadPool, chosen, target)

  return {
    ...(draft || {}),
    ...chosen,
    vias: chosen.vias,
    skipHangang: false,
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
