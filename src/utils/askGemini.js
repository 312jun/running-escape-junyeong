import { geocodeSeoulName, isInSeoul } from './seoul'
import { todayContext } from './weather'

function parseJson(text) {
  const match = text?.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function readVias(obj) {
  const raw = obj?.vias || obj?.waypoints
  if (!Array.isArray(raw)) return []
  return raw.map(readCoords).filter(Boolean).slice(0, 5)
}

function readCoords(obj) {
  const lat = Number(obj?.lat ?? obj?.latitude)
  const lng = Number(obj?.lng ?? obj?.lon ?? obj?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (!isInSeoul(lat, lng)) return null
  return { lat, lng }
}

function normalizePick(data) {
  if (!data || typeof data !== 'object') return null

  if (data.inSeoul === false || data.outsideSeoul === true) {
    return { blocked: true, reason: String(data.reason || '서울 한강 구간만 지원해요.').trim() }
  }

  const name = String(data.name || data.stopName || '').trim()
  if (!name) return null

  const lines = Array.isArray(data.lines)
    ? data.lines.map((l) => String(l)).filter(Boolean)
    : []

  const alternates = Array.isArray(data.alternates)
    ? data.alternates
        .map((alt) => ({
          name: String(alt.name || '').trim(),
          type: alt.type === 'bus' ? 'bus' : 'subway',
          lines: Array.isArray(alt.lines) ? alt.lines.map(String) : [],
          runKm: Number(alt.runKm) || null,
          hint: String(alt.hint || '').trim(),
          coords: readCoords(alt),
          vias: readVias(alt),
        }))
        .filter((alt) => alt.name)
        .slice(0, 3)
    : []

  return {
    blocked: false,
    name,
    type: data.type === 'bus' ? 'bus' : 'subway',
    lines,
    runKm: Number(data.runKm) || null,
    dir: ['east', 'west', 'north', 'south'].includes(data.dir) ? data.dir : 'east',
    pathOk: data.pathOk !== false,
    pathNote: String(data.pathNote || '').trim().slice(0, 180),
    hint: String(data.hint || '').trim().slice(0, 180),
    reason: String(data.reason || '').trim().slice(0, 240),
    briefing: String(data.briefing || '').trim().slice(0, 420),
    eventNote: String(data.eventNote || '').trim().slice(0, 220),
    weatherNote: String(data.weatherNote || '').trim().slice(0, 220),
    coords: readCoords(data),
    vias: readVias(data),
    alternates,
  }
}

export async function askEscapePlan({
  entry,
  targetKm,
  weather,
  skipHangang = false,
  toHangangKm,
  hangang,
  candidates = [],
}) {
  if (!isInSeoul(entry.lat, entry.lng)) {
    return {
      blocked: true,
      reason: '서울 밖 위치예요. 서울 한강 구간에서만 탈출점을 안내해요.',
    }
  }

  const day = todayContext()
  const weatherLine = weather
    ? [
        `${weather.temp}°C (체감 ${weather.feelsLike}°C)`,
        weather.label,
        `강수 ${weather.precip}mm`,
        weather.precipChance != null ? `앞으로 6시간 강수확률 최대 ${weather.precipChance}%` : null,
        `습도 ${weather.humidity}%`,
        `바람 ${weather.wind}km/h`,
        weather.uv != null ? `자외선 ${weather.uv}` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : '날씨 없음'

  const hangangLine = hangang
    ? `가장 가까운 한강 도보 기준점: 위도 ${hangang.lat.toFixed(5)}, 경도 ${hangang.lng.toFixed(5)} (약 ${Number(toHangangKm || 0).toFixed(2)}km)`
    : ''

  const hangangRule = skipHangang
    ? `한강 진입점까지 약 ${Number(toHangangKm || 0).toFixed(2)}km로, 목표 ${targetKm}km보다 같거나 멀다.
한강으로 가지 마라. 지금 위치에서 가장 가까운 버스 정류장(아주 가까우면 지하철역도 가능)만 고른다.
vias는 빈 배열 [].`
    : `핵심: 코스의 거의 전부는 한강공원·자전거길을 따라 동/서로 이동해야 한다.
목표 거리의 95% 이상을 한강변에서 채운다. 가까운 역에서 일찍 빠져나오지 마라.
시내 지름길은 금지. 한강에서 300m 넘게 떨어진 도심 역은 고르지 마라.
앱이 한강변 경로를 이미 잰다. 너는 한강변 km가 가장 긴 후보만 고른다.
목표 km보다 한강이 조금 길어도 된다. vias는 만들지 마라.`

  const candidateLine = candidates.length
    ? `한강변을 따라 잰 후보만 고른다:\n${candidates
        .map(
          (row, i) =>
            `${i + 1}. ${row.name} / 전체 ${Number(row.runKm).toFixed(1)}km / 한강변 ${Number(row.route?.hangangKm || 0).toFixed(1)}km / ${row.dir || ''} / lat ${row.coords.lat}, lng ${row.coords.lng}`,
        )
        .join('\n')}`
    : ''

  const prompt = `너는 서울 한강 러닝 탈출 코치다. 사용자는 목표 거리의 거의 전부를 한강변에서 채운 뒤 지하철·버스로 끊고 귀가한다.
가까운 역을 위해 한강을 일찍 떠나지 않는다. 한강변 km가 조금 더 길어도 그 코스를 고른다.
서울 한강·공원 러닝만 다룬다. 서울이 아니면 추천을 하지 않는다.

현재 시각(서울): ${day.label}
현재 위치(진입점): 위도 ${entry.lat.toFixed(5)}, 경도 ${entry.lng.toFixed(5)}
목표 거리: ${targetKm}km
${hangangLine}
기상: ${weatherLine}
${candidateLine}

해야 할 일:
1) 위치가 서울(한강 러닝 가능 권역)인지 확인한다. 아니면 inSeoul=false로 답한다.
2) 기상(온도·체감·비·바람·자외선·습도)을 반영해 탈출점을 고른다.
3) 오늘 요일·시간대·계절을 보고 한강 공원 이벤트·축제·불꽃·마켓·마라톤·주말 혼잡·야간 조명 등 가능성 있는 이벤트를 종합한다. 확실하지 않으면 "가능성"으로 말하고, 혼잡·우회·짧은 탈출을 제안한다.
4) 차는 타지 않는다. 도보·한강공원·자전거길이 코스의 대부분이어야 한다.
5) ${hangangRule}
6) 목표 km에 맞는 실제 지하철역을 고른다. 후보가 있으면 그 이름과 좌표를 그대로 쓴다.
7) 경로 좌표열(polyline)은 만들지 마라.
8) briefing에 기상+이벤트+한강/정류장 이유를 2~4문장으로 설명한다.
9) lat/lng는 서울 실제 좌표.

JSON만 답한다. 다른 말은 쓰지 마라.

서울이 아닐 때:
{"inSeoul":false,"reason":"한국어로 왜 안내하지 않는지"}

서울일 때:
{
  "inSeoul": true,
  "name": "탈출점 이름",
  "type": "subway 또는 bus",
  "lines": ["5","9"],
  "runKm": 4.8,
  "dir": "east 또는 west 또는 north 또는 south",
  "lat": 37.5216,
  "lng": 126.9242,
  "pathOk": true,
  "pathNote": "한 줄 안내",
  "hint": "가는 법 한 줄",
  "weatherNote": "기상 반영 한 줄",
  "eventNote": "오늘 이벤트·혼잡 한 줄",
  "briefing": "기상과 이벤트를 종합한 2~4문장 설명",
  "reason": "왜 이 탈출점인지 한두 문장",
  "alternates": [
    {"name":"대안","type":"subway","lines":["2"],"runKm":3.2,"hint":"짧은 안내","lat":37.53,"lng":126.90}
  ]
}`

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Gemini HTTP ${res.status}`)
  }

  const pick = normalizePick(parseJson(data.text))
  if (!pick) throw new Error('Gemini 응답을 읽지 못함')
  if (pick.blocked) return pick

  if (!pick.coords) {
    const hit = await geocodeSeoulName(pick.name)
    if (hit) pick.coords = { lat: hit.lat, lng: hit.lng }
  }

  if (pick.coords && !isInSeoul(pick.coords.lat, pick.coords.lng)) {
    return { blocked: true, reason: '추천 지점이 서울 밖이라 안내하지 않아요.' }
  }

  return pick
}

export async function askGeminiChooseRoute({ targetKm, options }) {
  const lines = options
    .map(
      (row, i) =>
        `${i + 1}. ${row.name} / 전체 ${row.runKm.toFixed(1)}km / 한강변 ${Number(row.route?.hangangKm || 0).toFixed(1)}km (${Math.round((row.route?.hangangShare || 0) * 100)}%) / ${row.dir || ''} / ${row.pathNote || row.hint || ''}`,
    )
    .join('\n')

  const prompt = `너는 서울 한강 러닝 코치다. 아래는 한강변을 본길로 잰 코스다. 한강변 km·비율이 가장 높은 것을 고른다.
목표 ${targetKm}km보다 한강이 조금 길어도 한강변을 고른다. 시내 지름·이른 탈출은 탈락이다.

${lines}

JSON만 답한다.
{"pick":1,"name":"역이름","reason":"왜 이 도보 코스가 최적인지 한두 문장"}`

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Gemini HTTP ${res.status}`)
  return parseJson(data.text)
}

export function dirLabel(dir) {
  if (dir === 'east') return '동쪽'
  if (dir === 'west') return '서쪽'
  if (dir === 'north') return '북쪽'
  if (dir === 'south') return '남쪽'
  return '근처'
}
