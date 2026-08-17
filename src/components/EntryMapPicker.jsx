import { useEffect, useRef, useState } from 'react'
import { createMap } from '../utils/mapEngine'

export default function EntryMapPicker({ center, pin, live, onPick, hint }) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const liveRef = useRef(null)
  const onPickRef = useRef(onPick)
  const [ready, setReady] = useState(0)
  onPickRef.current = onPick

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined

    let map
    try {
      map = createMap(el, { center, zoom: 15 })
    } catch (err) {
      console.warn('[map] 위치 지도를 못 그렸습니다:', err.message)
      return undefined
    }

    mapRef.current = map
    map.onClick((pt) => onPickRef.current?.(pt))
    requestAnimationFrame(() => map.resize())
    setReady((n) => n + 1)

    return () => {
      map.destroy()
      mapRef.current = null
      markerRef.current = null
      liveRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pin) return

    if (!markerRef.current) {
      markerRef.current = map.marker({
        position: pin,
        html: '<span class="entry-pin"><span class="entry-pin-dot"></span></span>',
        anchor: [9, 9],
        zIndex: 400,
      })
    } else {
      markerRef.current.setLatLng(pin)
    }
    map.panTo(pin)
  }, [pin, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!live) {
      liveRef.current?.setVisible(false)
      return
    }

    if (!liveRef.current) {
      liveRef.current = map.marker({
        position: live,
        html: '<span class="you-marker"><span class="you-pulse"></span><span class="you-core"></span></span>',
        anchor: [14, 14],
        zIndex: 500,
      })
    } else {
      liveRef.current.setLatLng(live)
      liveRef.current.setVisible(true)
    }
  }, [live, ready])

  return (
    <div className="entry-map-block">
      <p className="entry-map-hint">
        {hint || '지도를 눌러 한강에 들어간 자리를 찍으세요.'}
      </p>
      <div ref={wrapRef} className="entry-map entry-map-tall" />
    </div>
  )
}
