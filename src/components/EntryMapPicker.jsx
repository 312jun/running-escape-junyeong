import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const pinIcon = L.divIcon({
  className: 'entry-pin',
  html: '<span class="entry-pin-dot"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const liveIcon = L.divIcon({
  className: 'you-marker',
  html: '<span class="you-pulse"></span><span class="you-core"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

export default function EntryMapPicker({ center, pin, live, onPick, hint }) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const liveRef = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined

    const map = L.map(wrapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([center.lat, center.lng], 14)

    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    map.on('click', (e) => {
      onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapRef.current = map
    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      liveRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pin) return

    if (!markerRef.current) {
      markerRef.current = L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(map)
    } else {
      markerRef.current.setLatLng([pin.lat, pin.lng])
    }
    map.panTo([pin.lat, pin.lng])
  }, [pin])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!live) {
      if (liveRef.current) {
        map.removeLayer(liveRef.current)
        liveRef.current = null
      }
      return
    }

    if (!liveRef.current) {
      liveRef.current = L.marker([live.lat, live.lng], { icon: liveIcon, zIndexOffset: 500 }).addTo(map)
    } else {
      liveRef.current.setLatLng([live.lat, live.lng])
    }
  }, [live])

  return (
    <div className="entry-map-block">
      <p className="entry-map-hint">
        {hint || '지도를 눌러 한강에 들어간 자리를 찍으세요.'}
      </p>
      <div ref={wrapRef} className="entry-map entry-map-tall" />
    </div>
  )
}
