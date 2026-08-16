import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { kmTicks, pointAlongPath, progressOnPath, slicePath } from '../utils/route'
import { formatKm } from '../utils/geo'

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const startIcon = L.divIcon({
  className: 'route-pin',
  html: '<span class="route-pin-dot is-start"></span><span class="route-pin-label">출발</span>',
  iconSize: [40, 28],
  iconAnchor: [8, 10],
})

const endIcon = L.divIcon({
  className: 'route-pin',
  html: '<span class="route-pin-dot is-end"></span><span class="route-pin-label">끊기</span>',
  iconSize: [40, 28],
  iconAnchor: [8, 10],
})

const runnerIcon = L.divIcon({
  className: 'run-marker',
  html: '<span class="run-chevron"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

const youIcon = L.divIcon({
  className: 'you-marker',
  html: '<span class="you-pulse"></span><span class="you-core"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function tickIcon(km) {
  return L.divIcon({
    className: 'km-tick',
    html: `<span>${km}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export default function EscapeRouteMap({
  from,
  to,
  toName,
  route,
  live,
  followLive = false,
}) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef({})
  const animRef = useRef(0)
  const followRef = useRef(followLive)
  followRef.current = followLive

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined

    const map = L.map(wrapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([from.lat, from.lng], 14)

    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    mapRef.current = map
    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      window.cancelAnimationFrame(animRef.current)
      map.remove()
      mapRef.current = null
      layersRef.current = {}
    }
  }, [from.lat, from.lng])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !from || !to) return undefined

    window.cancelAnimationFrame(animRef.current)

    const prev = layersRef.current
    Object.values(prev).forEach((layer) => {
      if (layer?.remove) layer.remove()
    })
    if (prev.ticks) prev.ticks.forEach((m) => m.remove())
    layersRef.current = {}

    const start = L.latLng(from.lat, from.lng)
    const end = L.latLng(to.lat, to.lng)
    const points = route?.points?.length > 1 ? route.points : [from, to]
    const latlngs = points.map((p) => L.latLng(p.lat, p.lng))

    const ghost = L.polyline(latlngs, {
      color: '#1a73e8',
      weight: 7,
      opacity: 0.16,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map)

    const drawn = L.polyline([latlngs[0]], {
      color: '#1a73e8',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'route-flow',
    }).addTo(map)

    const startM = L.marker(start, { icon: startIcon, zIndexOffset: 400 }).addTo(map)
    const endM = L.marker(end, { icon: endIcon, zIndexOffset: 400 })
      .bindTooltip(toName || '탈출점', { permanent: false, direction: 'top' })
      .addTo(map)

    const ticks = kmTicks(points).map((tick) =>
      L.marker([tick.lat, tick.lng], { icon: tickIcon(tick.km), interactive: false }).addTo(map),
    )

    const runner = L.marker(start, { icon: runnerIcon, zIndexOffset: 700 }).addTo(map)
    const you = L.marker(start, { icon: youIcon, zIndexOffset: 800 })
    const accuracy = L.circle(start, {
      radius: 20,
      color: '#1a73e8',
      weight: 1,
      fillColor: '#1a73e8',
      fillOpacity: 0.08,
      opacity: 0.35,
    })

    layersRef.current = { ghost, drawn, startM, endM, runner, you, accuracy, ticks }

    map.fitBounds(L.latLngBounds(latlngs).pad(0.28))
    requestAnimationFrame(() => map.invalidateSize())

    const duration = Math.min(2400, Math.max(1100, points.length * 8))
    const started = performance.now()
    let previewT = 0
    let lastLivePan = 0

    function setRunner(t) {
      const pt = pointAlongPath(points, t)
      if (!pt) return
      runner.setLatLng([pt.lat, pt.lng])
      const el = runner.getElement()?.querySelector('.run-chevron')
      if (el) el.style.transform = `rotate(${pt.heading}deg)`
    }

    function frame(now) {
      const drawT = Math.min(1, (now - started) / duration)
      drawn.setLatLngs(slicePath(points, drawT).map((p) => [p.lat, p.lng]))

      if (drawT < 1) {
        setRunner(drawT)
        animRef.current = window.requestAnimationFrame(frame)
        return
      }

      const livePos = layersRef.current.livePos
      if (livePos) {
        const prog = progressOnPath(points, livePos)
        const snapped = pointAlongPath(points, prog.ratio)
        if (snapped) {
          runner.setLatLng([snapped.lat, snapped.lng])
          const el = runner.getElement()?.querySelector('.run-chevron')
          if (el) el.style.transform = `rotate(${snapped.heading}deg)`
        }
        if (followRef.current && now - lastLivePan > 900) {
          map.panTo([livePos.lat, livePos.lng], { animate: true, duration: 0.4 })
          lastLivePan = now
        }
      } else {
        previewT = (previewT + 0.0018) % 1
        setRunner(previewT)
      }

      animRef.current = window.requestAnimationFrame(frame)
    }

    animRef.current = window.requestAnimationFrame(frame)

    return () => {
      window.cancelAnimationFrame(animRef.current)
    }
  }, [from, to, toName, route])

  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers.you) return

    if (!live) {
      if (map.hasLayer(layers.you)) map.removeLayer(layers.you)
      if (map.hasLayer(layers.accuracy)) map.removeLayer(layers.accuracy)
      layers.livePos = null
      return
    }

    layers.livePos = live
    layers.you.setLatLng([live.lat, live.lng])
    layers.accuracy.setLatLng([live.lat, live.lng])
    if (live.accuracy) layers.accuracy.setRadius(Math.min(80, Math.max(18, live.accuracy)))
    if (!map.hasLayer(layers.you)) layers.you.addTo(map)
    if (!map.hasLayer(layers.accuracy)) layers.accuracy.addTo(map)
  }, [live])

  if (!from || !to) return null

  const liveProg =
    route?.points && live ? progressOnPath(route.points, live) : null

  return (
    <div className="route-stage">
      <div ref={wrapRef} className="entry-map entry-map-route" />
      <div className="route-hud">
        <p className="route-hud-kicker">
          {route?.source === 'osrm' ? '길을 따라' : '대략 방향'}
        </p>
        <p className="route-hud-main">
          {liveProg
            ? `남은 ${formatKm(liveProg.remaining)}`
            : route
              ? formatKm(route.km)
              : '경로 그리는 중'}
        </p>
        {liveProg && liveProg.offTrackKm > 0.25 ? (
          <p className="route-hud-sub">경로에서 약 {formatKm(liveProg.offTrackKm)} 벗어남</p>
        ) : (
          <p className="route-hud-sub">연두 선이 뛰는 길 · 화살표가 이동 방향</p>
        )}
      </div>
      {!route ? <p className="route-loading">길을 따라 찾는 중…</p> : null}
    </div>
  )
}
