import { useEffect, useMemo, useRef, useState } from 'react'
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
import { bumpRecommendCount } from '../utils/recommendStats'
import { trackEvent } from '../utils/ga'
import { etaMin, naverWalkUrl } from '../utils/route'
import { isInSeoul } from '../utils/seoul'
import { formatWeatherShort } from '../utils/weather'

function asDest(pick) {
  if (!pick || pick.blocked) return null
  return pick
}

function formatSignedKm(delta) {
  const abs = Math.abs(Number(delta) || 0)
  if (abs < 0.05) return '목표에 맞춤'
  const text =
    abs < 1
      ? `${Math.round(abs * 1000)}m`
      : `${(Math.round(abs * 10) / 10).toFixed(1).replace(/\.0$/, '')}km`
  return delta > 0 ? `+${text}` : `−${text}`
}

function deltaMinLabel(runKm, targetKm) {
  const d = etaMin(runKm) - etaMin(targetKm)
  if (d === 0) return '같은 시간'
  return d > 0 ? `${d}분 더` : `${Math.abs(d)}분 덜`
}

function destLabel({ kind, status, thinking }) {
  if (kind === 'short') return '짧게 끊기'
  if (kind === 'long') return '조금 더'
  if (status === 'ready' || kind === 'main') return '여기서 끊기'
  if (thinking) return '길을 보는 중'
  return '추천을 불러오지 못함'
}

/** 이지은(29, 여의도). 퇴근 러닝 목표는 지키되, 컨디션·날씨에 따라 한 정거장만 앞뒤로 끊고 싶어 한다. */
function spreadCue(kind, weather) {
  if (kind === 'short') return weather?.wet ? '비 올 때' : '지쳤을 때'
  if (kind === 'long') return '여유 있을 때'
  return ''
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
  const countedRef = useRef(false)

  useEffect(() => {
    if (outside) {
      setAi({
        status: 'blocked',
        pick: {
          blocked: true,
          reason: '서울 밖 위치예요. 서울에서만 탈출점을 안내해요.',
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
        if (!countedRef.current) {
          countedRef.current = true
          bumpRecommendCount()
          trackEvent('generate_route', { value: targetKm, method: pick?.kind || 'unknown' })
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
          via: pick.waterwayName || '한강',
        })
      : null
  const viewingAlt = pick?.kind === 'short' || pick?.kind === 'long'
  const targetDelta = runKm != null ? formatSignedKm(Number(runKm) - Number(targetKm)) : null

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
          <p className="dest-stats">{pick?.reason || '서울에서만 탈출점을 안내해요.'}</p>
        </div>
      ) : (
        <>
          {dest ? (
            <EscapeRouteMap
              from={entry}
              to={dest}
              toName={pick.name}
              via={pick.skipHangang ? null : pick?.vias?.[0]}
              viaLabel={pick.waterwayName || '한강'}
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

          <div className={viewingAlt ? 'dest-card is-alt' : 'dest-card'}>
            <p className="score-label">
              {destLabel({ kind: pick?.kind, status: ai.status, thinking })}
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
                    {targetDelta ? <span className="stat-chip">{targetDelta}</span> : null}
                    {pick.dir ? <span className="stat-chip">{dirLabel(pick.dir)}</span> : null}
                    <span className="stat-chip">{pick.type === 'bus' ? '버스' : '지하철'}</span>
                    {weather ? (
                      <span className={`stat-chip ${weather.wet ? 'is-warn' : ''}`}>
                        {formatWeatherShort(weather)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {pick.pathNote && !viewingAlt ? (
                  <p className={`path-note ${pick.pathOk ? '' : 'is-warn'}`}>
                    {pick.pathOk ? '러닝 길 OK' : '길 주의'} · {pick.pathNote}
                  </p>
                ) : null}

                {!viewingAlt ? (
                  <button
                    type="button"
                    className="details-toggle"
                    onClick={() => setOpenDetail((v) => !v)}
                  >
                    {openDetail ? '설명 접기' : '왜 여기인지 보기'}
                  </button>
                ) : null}

                {openDetail && !viewingAlt ? (
                  <div className="dest-detail">
                    {pick.briefing ? <p className="ai-briefing">{pick.briefing}</p> : null}
                    {pick.weatherNote ? <p className="score-hint">기상 · {pick.weatherNote}</p> : null}
                    {pick.eventNote ? <p className="score-hint">오늘 · {pick.eventNote}</p> : null}
                    {pick.reason ? <p className="ai-reason">{pick.reason}</p> : null}
                    {weather ? (
                      <p className="score-hint">
                        {formatWeatherShort(weather)}
                        {weather.feelsLike != null ? ` · 체감 ${weather.feelsLike}°` : ''}
                        {weather.precipChance != null ? ` · 강수 ${weather.precipChance}%` : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : thinking ? (
              <p className="dest-stats">강변 도로로 실제 거리를 재고 있어요.</p>
            ) : (
              <p className="dest-stats">추천을 못 받았어요. 거리를 다시 골라 보세요.</p>
            )}
          </div>

          {ai.status === 'error' && (
            <p className="status-note">AI를 못 썼어요. {ai.error}</p>
          )}

          {ai.pick?.alternates?.length ? (
            <div className="alt-block">
              <div className="alt-head">
                <p className="alt-label">컨디션에 따라</p>
                {viewingAlt ? (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setActive(ai.pick)
                      setFollow(false)
                    }}
                  >
                    추천으로
                  </button>
                ) : null}
              </div>
              <p className="alt-blurb">
                {weather?.wet
                  ? '오늘은 짧게 끊는 편이 나을 수 있어요'
                  : `목표 ${targetKm}km보다 짧게, 또는 조금 더`}
              </p>
              <div className="alt-list">
                {ai.pick.alternates.map((alt) => {
                  const on = active?.name === alt.name
                  const delta = Number(alt.runKm) - Number(targetKm)
                  return (
                    <button
                      key={`${alt.kind}-${alt.name}`}
                      type="button"
                      className={on ? 'alt-chip is-on' : 'alt-chip'}
                      disabled={!alt.coords}
                      onClick={() => {
                        if (!alt.coords) return
                        setActive({
                          ...ai.pick,
                          kind: alt.kind,
                          name: alt.name,
                          type: alt.type,
                          lines: alt.lines,
                          runKm: alt.runKm,
                          dir: alt.dir,
                          hint: alt.hint,
                          coords: alt.coords,
                          vias: alt.vias,
                          route: alt.route,
                          waterwayName: alt.waterwayName || ai.pick.waterwayName,
                          pathOk: alt.pathOk,
                          pathNote: alt.pathNote || alt.hint,
                          briefing: '',
                          reason: alt.hint,
                          weatherNote: '',
                          eventNote: '',
                        })
                        setFollow(false)
                        setOpenDetail(false)
                      }}
                    >
                      <span className={`alt-kind is-${alt.kind}`}>
                        {alt.kind === 'short' ? '짧게' : '길게'}
                      </span>
                      <span className="alt-copy">
                        <span className="stop-name">{alt.name}</span>
                        <span className="stop-hint">{spreadCue(alt.kind, weather)}</span>
                      </span>
                      <span className="alt-delta">
                        <span className="alt-delta-km">
                          {alt.runKm != null ? formatKm(alt.runKm) : '—'}
                        </span>
                        <span className="alt-delta-vs">
                          {formatSignedKm(delta)} · {deltaMinLabel(alt.runKm, targetKm)}
                        </span>
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
                {viewingAlt ? `${pick.name}으로 안내` : '네이버 지도로 안내'}
              </a>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
