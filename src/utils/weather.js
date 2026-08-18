export function weatherLabel(weather) {
  if (weather && typeof weather === 'object') return weather.label || '날씨 불명'
  return '날씨 불명'
}

export function isWet(weather) {
  return Boolean(weather?.wet)
}

export function formatWeatherShort(weather) {
  if (!weather) return ''
  const bits = [`${weather.temp}°`]
  if (weather.humidity != null) bits.push(`습도 ${weather.humidity}%`)
  if (weather.label) bits.push(weather.label)
  return bits.join(' · ')
}

export async function fetchWeather(lat, lng) {
  const url = new URL('/api/weather', window.location.origin)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lng', String(lng))

  const res = await fetch(url)
  if (!res.ok) throw new Error(`날씨 HTTP ${res.status}`)

  const data = await res.json()
  if (data?.temp == null) throw new Error(data?.error || '날씨 없음')
  return data
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
      hourCycle: 'h23',
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
