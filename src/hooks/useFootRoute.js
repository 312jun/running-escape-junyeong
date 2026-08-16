import { useEffect, useState } from 'react'
import { loadRunPath } from '../utils/route'

export function useFootRoute(from, to) {
  const [route, setRoute] = useState(null)
  const [status, setStatus] = useState('idle')

  const fromKey = from ? `${from.lat.toFixed(5)},${from.lng.toFixed(5)}` : ''
  const toKey = to ? `${to.lat.toFixed(5)},${to.lng.toFixed(5)}` : ''

  useEffect(() => {
    if (!fromKey || !toKey) {
      setRoute(null)
      setStatus('idle')
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

    let cancelled = false
    setStatus('loading')
    setRoute(null)

    loadRunPath(origin, dest)
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
  }, [fromKey, toKey])

  return { route, status }
}
