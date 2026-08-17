import { askEscapePlan, askGeminiChooseRoute } from './askGemini'
import { hangangApproachKm, hangangRunVias, nearestHangangPoint, pickRiverExit } from './hangang'
import { formatKm } from './geo'
import { composeHangangRoute, loadRunPath } from './route'
import { nearestBusStop } from './seoul'

function closestToTarget(rows, targetKm) {
  return [...rows].sort((a, b) => {
    const shareA = Number(a.route?.hangangShare) || 0
    const shareB = Number(b.route?.hangangShare) || 0
    if (Math.abs(shareA - shareB) > 0.02) return shareB - shareA
    const hangA = Number(a.route?.hangangKm) || 0
    const hangB = Number(b.route?.hangangKm) || 0
    if (Math.abs(hangA - hangB) > 0.12) return hangB - hangA
    return Math.abs(a.runKm - targetKm) - Math.abs(b.runKm - targetKm)
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
    pathOk: share >= 0.85,
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

  const exits = ['east', 'west']
    .map((dir) => pickRiverExit(entry, Number(targetKm), dir))
    .filter(Boolean)

  const measuredAll = (
    await Promise.all(
      exits.map(async (exit) => {
        try {
          return await measureHangangStop(entry, exit.stop, exit.dir, exit.riverEndKm)
        } catch {
          return null
        }
      }),
    )
  ).filter(Boolean)

  const measured = measuredAll.filter((row) => (Number(row.route?.hangangShare) || 0) >= 0.8)
  const pool = measured.length ? measured : measuredAll

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
      const candHang = Number(cand.route?.hangangKm) || 0
      const nowHang = Number(chosen.route?.hangangKm) || 0
      if (candHang >= nowHang * 0.98) {
        chosen = cand
        if (decision.reason) chosen = { ...chosen, reason: String(decision.reason).slice(0, 240) }
      }
    }
  } catch {
    // 한강변 거리로만 고른다
  }

  if (draft?.name) {
    const geminiMatch = pool.find((row) => row.name === draft.name)
    if (geminiMatch && (Number(geminiMatch.route?.hangangKm) || 0) >= (Number(chosen.route?.hangangKm) || 0) * 0.98) {
      chosen = {
        ...geminiMatch,
        reason: chosen.reason || draft.reason,
      }
    }
  }

  chosen = {
    ...chosen,
    skipHangang: false,
    briefing: draft?.briefing || chosen.briefing,
    weatherNote: draft?.weatherNote || '',
    eventNote: draft?.eventNote || '',
    reason: chosen.reason || draft?.reason || `한강변을 따라 ${formatKm(chosen.route.hangangKm)} 뛴 뒤 ${chosen.name}에서 끊습니다.`,
    route: { ...chosen.route, judgedByGemini: true },
  }

  const others = pool.filter((row) => row.name !== chosen.name)

  return {
    ...(draft || {}),
    ...chosen,
    vias: chosen.vias,
    skipHangang: false,
    alternates: others.map((row) => ({
      name: row.name,
      type: row.type,
      lines: row.lines,
      runKm: row.runKm,
      hint: row.hint || row.pathNote,
      coords: row.coords,
      vias: row.vias,
      route: row.route,
    })),
  }
}
