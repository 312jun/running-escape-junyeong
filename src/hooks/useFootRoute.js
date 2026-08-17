import { useEffect, useState } from 'react'
import { loadRunPath } from '../utils/route'

export function useFootRoute(from, to, vias = [], seedRoute = null) {
  const [route, setRoute] = useState(null)
  const [status, setStatus] = useState('idle')

  const fromKey = from ? `${from.lat.toFixed(5)},${from.lng.toFixed(5)}` : ''
  const toKey = to ? `${to.lat.toFixed(5)},${to.lng.toFixed(5)}` : ''
  const viaKey = (vias || [])
    .map((p) => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`)
    .join('|')
  const seedKey = seedRoute?.points?.length ? String(seedRoute.km) : ''

  useEffect(() => {
    if (!fromKey || !toKey) {
      setRoute(null)
      setStatus('idle')
      return undefined
    }

    if (seedRoute?.points?.length > 1) {
      setRoute(seedRoute)
      setStatus('ready')
      return undefined
    }

    const origin = {
      lat: Number(fromKey.split(',')[0]),
      lng: Number(fromKey.split(',')[1]),
    }
    const dest = {
      lat: Number(toKey.split(',')[0]),
      lng: Number(toKey.split(',')[1]),
    }
    const stops = viaKey
      ? viaKey.split('|').map((pair) => {
          const [lat, lng] = pair.split(',').map(Number)
          return { lat, lng }
        })
      : []

    let cancelled = false
    setStatus('loading')
    setRoute(null)

    loadRunPath(origin, dest, stops, { hangang: stops.length > 0 })
      .then((data) => {
        if (cancelled) return
        setRoute(data)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [fromKey, toKey, viaKey, seedKey])

  return { route, status }
}
