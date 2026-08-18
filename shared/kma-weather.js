const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'

const SKY_LABEL = {
  1: '맑음',
  3: '구름많음',
  4: '흐림',
}

const PTY_LABEL = {
  1: '비',
  2: '비/눈',
  3: '눈',
  4: '소나기',
  5: '빗방울',
  6: '빗방울눈날림',
  7: '눈날림',
}

export function toKmaGrid(lat, lon) {
  const RE = 6371.00877
  const GRID = 5.0
  const SLAT1 = 30.0
  const SLAT2 = 60.0
  const OLON = 126.0
  const OLAT = 38.0
  const XO = 43
  const YO = 136
  const DEGRAD = Math.PI / 180

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)

  const ra = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5), sn)
  let theta = lon * DEGRAD - olon
  if (theta > Math.PI) theta -= 2 * Math.PI
  if (theta < -Math.PI) theta += 2 * Math.PI
  theta *= sn

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  }
}

export async function fetchKmaWeather(lat, lng, serviceKey) {
  const key = String(serviceKey || '').trim()
  if (!key) {
    const err = new Error('KMA_SERVICE_KEY가 없습니다. .env에 넣어 주세요.')
    err.statusCode = 503
    throw err
  }

  const { nx, ny } = toKmaGrid(lat, lng)
  const now = seoulParts()

  const [obsRes, fcstRes] = await Promise.allSettled([
    fetchKmaItems('getUltraSrtNcst', ncstStamp, now, nx, ny, key),
    fetchKmaItems('getUltraSrtFcst', fcstStamp, now, nx, ny, key),
  ])

  const obsItems = obsRes.status === 'fulfilled' ? obsRes.value : []
  const fcstItems = fcstRes.status === 'fulfilled' ? fcstRes.value : []
  if (!obsItems.length && !fcstItems.length) {
    const failed = obsRes.status === 'rejected' ? obsRes.reason : fcstRes.reason
    throw failed || new Error('날씨 없음')
  }

  const obs = mapByCategory(obsItems, 'obsrValue')
  const hours = groupForecast(fcstItems)
  const near = hours[0] || {}

  const temp = firstNumber(obs.T1H, near.T1H)
  const humidity = firstNumber(obs.REH, near.REH)
  const windMs = firstNumber(obs.WSD, near.WSD)
  const precip = parsePrecip(obs.RN1 ?? near.RN1)
  const pty = firstNumber(obs.PTY, near.PTY) ?? 0
  const sky = firstNumber(near.SKY)
  const pops = hours.map((h) => firstNumber(h.POP)).filter((n) => n != null)
  const precipChance = pops.length ? Math.max(...pops) : null
  const rainSoon = hours.some((h) => (firstNumber(h.PTY) || 0) > 0)

  if (temp == null) throw new Error('날씨 없음')

  const raining = pty > 0 || precip > 0
  const label = raining ? PTY_LABEL[pty] || '비' : SKY_LABEL[sky] || '날씨 불명'
  const feels = feelsLikeC(temp, humidity, windMs)

  return {
    temp: Math.round(temp),
    feelsLike: Math.round(feels ?? temp),
    precip,
    precipChance,
    humidity: humidity == null ? null : Math.round(humidity),
    wind: windMs == null ? null : Math.round(windMs * 3.6),
    uv: null,
    sky,
    pty,
    label,
    wet: raining || rainSoon || (precipChance != null && precipChance >= 50),
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function ymd(parts) {
  return `${parts.year}${pad2(parts.month)}${pad2(parts.day)}`
}

function seoulParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function shiftSeoul(parts, hours) {
  const iso = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:00+09:00`
  return seoulParts(new Date(Date.parse(iso) + hours * 3600 * 1000))
}

function ncstStamp(parts) {
  const p = parts.minute < 10 ? shiftSeoul(parts, -1) : parts
  return { date: ymd(p), time: `${pad2(p.hour)}00` }
}

function fcstStamp(parts) {
  const p = parts.minute < 45 ? shiftSeoul(parts, -1) : parts
  return { date: ymd(p), time: `${pad2(p.hour)}30` }
}

function encodeServiceKey(serviceKey) {
  return serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey)
}

async function fetchKmaItems(op, stampFn, startParts, nx, ny, serviceKey) {
  let parts = startParts
  let lastErr = null
  for (let i = 0; i < 3; i += 1) {
    const stamp = stampFn(parts)
    try {
      const items = await kmaGet(op, stamp, nx, ny, serviceKey)
      if (items.length) return items
    } catch (err) {
      lastErr = err
      if (err.statusCode && err.statusCode < 500 && err.statusCode !== 404) throw err
    }
    parts = shiftSeoul(parts, -1)
  }
  if (lastErr) throw lastErr
  return []
}

async function kmaGet(op, stamp, nx, ny, serviceKey) {
  const q = new URLSearchParams({
    numOfRows: '100',
    pageNo: '1',
    dataType: 'JSON',
    base_date: stamp.date,
    base_time: stamp.time,
    nx: String(nx),
    ny: String(ny),
  })
  const url = `${KMA_BASE}/${op}?serviceKey=${encodeServiceKey(serviceKey)}&${q}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  if (!res.ok) throw new Error(`날씨 HTTP ${res.status}`)

  if (text.includes('<OpenAPI_ServiceResponse') || text.includes('<cmmMsgHeader')) {
    const msg = text.match(/<returnAuthMsg>([^<]+)</)?.[1] || '기상청 인증 오류'
    const err = new Error(msg)
    err.statusCode = 502
    throw err
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('날씨 응답을 읽지 못했어요')
  }

  const header = data?.response?.header
  const code = String(header?.resultCode ?? '')
  if (code === '03') return []
  if (code && code !== '00' && code !== '0') {
    const err = new Error(header?.resultMsg || `기상청 ${code}`)
    err.statusCode = 502
    throw err
  }

  return asList(data?.response?.body?.items?.item)
}

function asList(item) {
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

function mapByCategory(items, valueKey) {
  const out = {}
  for (const row of items) {
    if (row?.category) out[row.category] = row[valueKey]
  }
  return out
}

function groupForecast(items) {
  const map = new Map()
  for (const row of items) {
    if (!row?.fcstDate || !row?.fcstTime) continue
    const key = `${row.fcstDate}${row.fcstTime}`
    if (!map.has(key)) map.set(key, {})
    map.get(key)[row.category] = row.fcstValue
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, cats]) => cats)
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (!Number.isFinite(n)) continue
    if (Math.abs(n) >= 900) continue
    return n
  }
  return null
}

function parsePrecip(value) {
  if (value == null) return 0
  const s = String(value).trim()
  if (!s || s === '-' || s === '강수없음' || s === '0') return 0
  if (s.includes('미만')) return 0.5
  if (s.includes('30.0~50') || s.includes('30~50')) return 40
  if (s.includes('50.0mm') || s.includes('50mm')) return 50
  const n = parseFloat(s.replace(/mm/gi, ''))
  return Number.isFinite(n) ? n : 0
}

function feelsLikeC(tempC, humidity, windMs) {
  const rh = Number.isFinite(humidity) ? humidity : 50
  const ws = Number.isFinite(windMs) ? Math.max(0, windMs) : 0
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC))
  return tempC + 0.33 * e - 0.7 * ws - 4
}
