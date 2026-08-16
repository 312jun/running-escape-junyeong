import { useEffect, useState } from 'react'
import { fetchWeather } from '../utils/weather'

export function useWeather(lat, lng) {
  const [weather, setWeather] = useState(null)
  const [status, setStatus] = useState('idle')
  const latKey = lat == null ? null : lat.toFixed(3)
  const lngKey = lng == null ? null : lng.toFixed(3)

  useEffect(() => {
    if (latKey == null || lngKey == null) {
      setWeather(null)
      setStatus('idle')
      return undefined
    }

    let cancelled = false
    setStatus('loading')

    fetchWeather(Number(latKey), Number(lngKey))
      .then((data) => {
        if (cancelled) return
        setWeather(data)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [latKey, lngKey])

  return { weather, status }
}
