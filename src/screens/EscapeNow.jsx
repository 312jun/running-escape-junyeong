import { useEffect, useMemo, useState } from 'react'
import EscapeRouteMap from '../components/EscapeRouteMap'
import LineBadge from '../components/LineBadge'
import StepBar from '../components/StepBar'
import ThinkingModal from '../components/ThinkingModal'
import { useFootRoute } from '../hooks/useFootRoute'
import { useLiveLocation } from '../hooks/useLiveLocation'
import { useWeather } from '../hooks/useWeather'
import { dirLabel } from '../utils/askGemini'
import { planEscapeRun } from '../utils/planEscape'
import { formatKm } from '../utils/geo'
import { etaMin, naverWalkUrl } from '../utils/route'
import { isInSeoul } from '../utils/seoul'

function asDest(pick) {
  if (!pick || pick.blocked) return null
  return pick
}

export default function EscapeNow({ entry, targetKm, onBack }) {
  const geo = useLiveLocation()
  const outside = !isInSeoul(entry.lat, entry.lng)
  const { weather, status: weatherStatus } = useWeather(
    outside ? null : entry.lat,
    outside ? null : entry.lng,
  )
  const [ai, setAi] = useState({ status: 'idle', pick: null, error: null })
  const [active, setActive] = useState(null)
  const [openDetail, setOpenDetail] = useState(false)
  const [follow, setFollow] = useState(false)

  useEffect(() => {
    if (outside) {
      setAi({
        status: 'blocked',
        pick: {
          blocked: true,
          reason: '서울 밖 위치예요. 서울 한강 구간에서만 탈출점을 안내해요.',
        },
        error: null,
      })
      return undefined
    }

    if (weatherStatus === 'idle' || weatherStatus === 'loading') return undefined

    let cancelled = false
    setAi({ status: 'loading', pick: null, error: null })
    setActive(null)

    planEscapeRun({ entry, targetKm, weather })
      .then((pick) => {
        if (cancelled) return
        if (pick.blocked) {
          setAi({ status: 'blocked', pick, error: null })
          return
        }
        setAi({ status: 'ready', pick, error: null })
        setActive(pick)
      })
      .catch((err) => {
        if (cancelled) return
        setAi({ status: 'error', pick: null, error: err.message || String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [entry, targetKm, weather, weatherStatus, outside])

  const pick = asDest(active) || asDest(ai.pick)
  const dest = pick?.coords
  const { route } = useFootRoute(dest ? entry : null, dest, pick?.vias, pick?.route)
  const thinking =
    !outside &&
    (ai.status === 'loading' || weatherStatus === 'loading' || weatherStatus === 'idle')

  const live = useMemo(() => {
    if (geo.status !== 'ready' || !geo.coords) return null
    return { ...geo.coords, accuracy: geo.accuracy }
  }, [geo.status, geo.coords, geo.accuracy])

  const runKm = route?.km ?? pick?.runKm
  const lines = pick?.lines?.length
    ? pick.lines
    : pick
      ? [pick.type === 'bus' ? '버스' : '지하철']
      : []
  const mapsUrl =
    dest && entry
      ? naverWalkUrl(entry, dest, pick?.skipHangang ? [] : pick?.vias || [], {
          from: entry.name || '출발',
          to: pick.name || '탈출점',
        })
      : null

  return (
    <section className="screen screen-escape">
      <ThinkingModal open={thinking} targetKm={targetKm} />

      <StepBar step={2} />
      <header className="page-head page-head-tight">
        <button type="button" className="back-btn" onClick={onBack}>
          ← 거리
        </button>
        <div>
          <p className="eyebrow">{targetKm}km · 탈출</p>
          <h1>여기로</h1>
        </div>
      </header>

      {ai.status === 'blocked' || pick?.blocked ? (
        <div className="dest-card">
          <p className="score-label">안내 불가</p>
          <p className="dest-name">서울만</p>
          <p className="dest-stats">{pick?.reason || '서울 한강 구간에서만 탈출점을 안내해요.'}</p>
        </div>
      ) : (
        <>
          {dest ? (
            <EscapeRouteMap
              from={entry}
              to={dest}
              toName={pick.name}
              via={pick.skipHangang ? null : pick?.vias?.[0]}
              skipHangang={Boolean(pick.skipHangang)}
              route={route}
              live={live}
              followLive={follow}
            >
              <div className="route-fabs">
                <button
                  type="button"
                  className={follow ? 'map-fab is-on' : 'map-fab'}
                  onClick={() => setFollow((v) => !v)}
                  disabled={!live}
                  aria-label={follow ? '따라가기 끄기' : '내 위치 따라가기'}
                >
                  {follow ? '따라가는 중' : '따라가기'}
                </button>
                {geo.status !== 'ready' ? (
                  <button type="button" className="map-fab" onClick={geo.retry}>
                    GPS
                  </button>
                ) : null}
              </div>
            </EscapeRouteMap>
          ) : null}

          <div className="dest-card">
            <p className="score-label">
              {ai.status === 'ready' ? '여기서 끊기' : thinking ? '길을 보는 중' : '추천을 불러오지 못함'}
            </p>
            {pick && !pick.blocked ? (
              <>
                <p className="dest-name">{pick.name}</p>
                <div className="dest-meta">
                  <div className="line-row score-lines">
                    {lines.map((line) => (
                      <LineBadge key={line} line={line} />
                    ))}
                  </div>
                  <div className="stat-row">
                    {runKm != null ? <span className="stat-chip">{formatKm(runKm)}</span> : null}
                    {runKm != null ? <span className="stat-chip">약 {etaMin(runKm)}분</span> : null}
                    {pick.dir ? <span className="stat-chip">{dirLabel(pick.dir)}</span> : null}
                    <span className="stat-chip">{pick.type === 'bus' ? '버스' : '지하철'}</span>
                  </div>
                </div>
                {pick.pathNote ? (
                  <p className={`path-note ${pick.pathOk ? '' : 'is-warn'}`}>
                    {pick.pathOk ? '러닝 길 OK' : '길 주의'} · {pick.pathNote}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="details-toggle"
                  onClick={() => setOpenDetail((v) => !v)}
                >
                  {openDetail ? '설명 접기' : '왜 여기인지 보기'}
                </button>

                {openDetail ? (
                  <div className="dest-detail">
                    {pick.briefing ? <p className="ai-briefing">{pick.briefing}</p> : null}
                    {pick.weatherNote ? <p className="score-hint">기상 · {pick.weatherNote}</p> : null}
                    {pick.eventNote ? <p className="score-hint">오늘 · {pick.eventNote}</p> : null}
                    {pick.reason ? <p className="ai-reason">{pick.reason}</p> : null}
                    {weather ? (
                      <p className="score-hint">
                        {weather.temp}° · {weather.label}
                        {weather.precipChance != null ? ` · 강수 ${weather.precipChance}%` : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : thinking ? (
              <p className="dest-stats">한강 공원길로 실제 거리를 재고 있어요.</p>
            ) : (
              <p className="dest-stats">추천을 못 받았어요. 거리를 다시 골라 보세요.</p>
            )}
          </div>

          {ai.status === 'error' && (
            <p className="status-note">AI를 못 썼어요. {ai.error}</p>
          )}

          {ai.pick?.alternates?.length ? (
            <div className="alt-block">
              <p className="alt-label">다른 끊을 곳</p>
              {active?.name && active.name !== ai.pick.name ? (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setActive(ai.pick)
                    setFollow(false)
                  }}
                >
                  추천({ai.pick.name})으로
                </button>
              ) : null}
              <div className="alt-list">
                {ai.pick.alternates.map((alt) => {
                  const on = active?.name === alt.name
                  return (
                    <button
                      key={alt.name}
                      type="button"
                      className={on ? 'alt-chip is-on' : 'alt-chip'}
                      disabled={!alt.coords}
                      onClick={() => {
                        if (!alt.coords) return
                        setActive({
                          ...ai.pick,
                          name: alt.name,
                          type: alt.type,
                          lines: alt.lines,
                          runKm: alt.runKm,
                          hint: alt.hint,
                          coords: alt.coords,
                          vias: alt.vias,
                          route: alt.route,
                          pathNote: alt.hint,
                          briefing: '',
                          reason: alt.hint,
                        })
                        setFollow(false)
                      }}
                    >
                      <span className="stop-name">{alt.name}</span>
                      <span className="stop-hint">
                        {alt.runKm != null ? `${formatKm(alt.runKm)} · ` : ''}
                        {alt.hint || (alt.type === 'bus' ? '버스' : '지하철')}
                      </span>
                      <span className="line-row">
                        {(alt.lines.length ? alt.lines : [alt.type === 'bus' ? '버스' : '지하철']).map(
                          (line) => (
                            <LineBadge key={line} line={line} />
                          ),
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {mapsUrl ? (
            <div className="sticky-run">
              <a className="run-btn run-btn-link" href={mapsUrl} target="_blank" rel="noreferrer">
                네이버 지도로 안내
              </a>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
