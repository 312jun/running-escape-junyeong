import { useEffect, useRef, useState } from 'react'
import { kmTicks, pointAlongPath, progressOnPath, slicePath } from '../utils/route'
import { formatKm } from '../utils/geo'
import { createMap } from '../utils/mapEngine'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function routeKicker(route) {
  if (route?.source === 'hangang' || route?.viaHangang) return '한강변 도보'
  if (route?.source === 'google') return 'Google 도보'
  if (route?.source === 'brouter') return '한강 공원길'
  if (route?.source === 'osrm') return '걸어서'
  return '도보'
}

export default function EscapeRouteMap({
  from,
  to,
  toName,
  via,
  skipHangang = false,
  route,
  live,
  followLive = false,
  children,
}) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef({})
  const animRef = useRef(0)
  const followRef = useRef(followLive)
  const [ready, setReady] = useState(0)
  followRef.current = followLive

  useEffect(() => {
    if (!wrapRef.current) return undefined

    let map
    try {
      map = createMap(wrapRef.current, { center: from, zoom: 15 })
    } catch (err) {
      console.warn('[map] 경로 지도를 못 그렸습니다:', err.message)
      return undefined
    }

    mapRef.current = map
    requestAnimationFrame(() => map.resize())
    setReady((n) => n + 1)

    return () => {
      window.cancelAnimationFrame(animRef.current)
      map.destroy()
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

    const points = route?.points?.length > 1 ? route.points : [from, to]

    const ghost = map.polyline({
      path: points,
      color: '#1a73e8',
      weight: 7,
      opacity: 0.16,
    })
    const drawn = map.polyline({
      path: [points[0]],
      color: '#1a73e8',
      weight: 5,
      opacity: 0.95,
      className: 'route-flow',
    })

    const startM = map.marker({
      position: from,
      html: '<span class="route-pin"><span class="route-pin-dot is-start"></span><span class="route-pin-label">출발</span></span>',
      anchor: [8, 10],
      zIndex: 400,
    })
    const hangangM =
      via && (Math.abs(via.lat - from.lat) > 1e-5 || Math.abs(via.lng - from.lng) > 1e-5)
        ? map.marker({
            position: via,
            html: '<span class="route-pin"><span class="route-pin-dot is-hangang"></span><span class="route-pin-label">한강</span></span>',
            anchor: [8, 10],
            zIndex: 450,
          })
        : null
    const endM = map.marker({
      position: to,
      html: `<span class="route-pin"><span class="route-pin-dot is-end"></span><span class="route-pin-label">${escapeHtml(toName || '끊기')}</span></span>`,
      anchor: [8, 10],
      zIndex: 400,
    })

    const ticks = kmTicks(points).map((tick) =>
      map.marker({
        position: tick,
        html: `<span class="km-tick"><span>${tick.km}</span></span>`,
        anchor: [11, 11],
        zIndex: 300,
      }),
    )

    const runner = map.marker({
      position: from,
      html: '<span class="run-marker"><span class="run-chevron"></span></span>',
      anchor: [11, 11],
      zIndex: 700,
    })
    const you = map.marker({
      position: from,
      html: '<span class="you-marker"><span class="you-pulse"></span><span class="you-core"></span></span>',
      anchor: [14, 14],
      zIndex: 800,
    })
    you.setVisible(false)
    const accuracy = map.circle({
      center: from,
      radius: 20,
      color: '#1a73e8',
      weight: 1,
      fillColor: '#1a73e8',
      fillOpacity: 0.08,
      opacity: 0.35,
    })
    accuracy.setVisible(false)

    layersRef.current = { ghost, drawn, startM, hangangM, endM, runner, you, accuracy, ticks }

    map.fit(points)
    requestAnimationFrame(() => map.resize())

    const duration = Math.min(2400, Math.max(1100, points.length * 8))
    const started = performance.now()
    let previewT = 0
    let lastLivePan = 0

    function setRunner(t) {
      const pt = pointAlongPath(points, t)
      if (!pt) return
      runner.setLatLng(pt)
      const el = runner.getElement()?.querySelector('.run-chevron')
      if (el) el.style.transform = `rotate(${pt.heading}deg)`
    }

    function frame(now) {
      const drawT = Math.min(1, (now - started) / duration)
      drawn.setPath(slicePath(points, drawT))

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
          runner.setLatLng(snapped)
          const el = runner.getElement()?.querySelector('.run-chevron')
          if (el) el.style.transform = `rotate(${snapped.heading}deg)`
        }
        if (followRef.current && now - lastLivePan > 900) {
          map.panTo(livePos)
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
  }, [from, to, toName, via, route, ready])

  useEffect(() => {
    const layers = layersRef.current
    if (!layers.you) return

    if (!live) {
      layers.you.setVisible(false)
      layers.accuracy.setVisible(false)
      layers.livePos = null
      return
    }

    layers.livePos = live
    layers.you.setLatLng(live)
    layers.accuracy.setLatLng(live)
    if (live.accuracy) layers.accuracy.setRadius(Math.min(80, Math.max(18, live.accuracy)))
    layers.you.setVisible(true)
    layers.accuracy.setVisible(true)
  }, [live, ready])

  if (!from || !to) return null

  const liveProg = route?.points && live ? progressOnPath(route.points, live) : null

  return (
    <div className="route-stage">
      <div ref={wrapRef} className="entry-map entry-map-route" />
      <div className="route-hud">
        <p className="route-hud-kicker">{routeKicker(route)}</p>
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
          <p className="route-hud-sub">
            {skipHangang
              ? '한강까지가 목표 거리보다 멀어 가까운 정류장으로'
              : route?.hangangKm
                ? `한강변 ${formatKm(route.hangangKm)}`
                : '한강변을 따라 이동'}
          </p>
        )}
      </div>
      {!route ? <p className="route-loading">걸어서 가는 길을 찾는 중…</p> : null}
      {children}
    </div>
  )
}
