const WMO = {
  0: '맑음',
  1: '대체로 맑음',
  2: '구름 조금',
  3: '흐림',
  45: '안개',
  48: '안개',
  51: '이슬비',
  53: '이슬비',
  55: '이슬비',
  61: '비',
  63: '비',
  65: '비',
  66: '비',
  67: '비',
  71: '눈',
  73: '눈',
  75: '눈',
  80: '소나기',
  81: '소나기',
  82: '소나기',
  95: '뇌우',
  96: '뇌우',
  99: '뇌우',
}

export function weatherLabel(code) {
  return WMO[code] ?? '날씨 불명'
}

export function isWet(code) {
  return [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)
}

export async function fetchWeather(lat, lng) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,uv_index',
  )
  url.searchParams.set('hourly', 'precipitation_probability,weather_code')
  url.searchParams.set('forecast_hours', '6')
  url.searchParams.set('timezone', 'Asia/Seoul')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`날씨 HTTP ${res.status}`)

  const data = await res.json()
  const current = data.current
  if (!current) throw new Error('날씨 없음')

  const code = current.weather_code
  const probs = data.hourly?.precipitation_probability || []
  const maxPrecipChance = probs.length ? Math.max(...probs.map(Number).filter(Number.isFinite)) : null

  return {
    temp: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m),
    precip: current.precipitation ?? 0,
    precipChance: maxPrecipChance,
    humidity: current.relative_humidity_2m,
    wind: current.wind_speed_10m,
    uv: current.uv_index ?? null,
    code,
    label: weatherLabel(code),
    wet: isWet(code),
  }
}

export function todayContext() {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    })
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )

  return {
    label: fmt.format(now),
    weekday: parts.weekday,
    hour: Number(parts.hour),
  }
}
