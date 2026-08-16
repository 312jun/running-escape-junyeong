import { useState } from 'react'
import { TARGET_KMS } from '../data/courses'
import { useWeather } from '../hooks/useWeather'
import { etaMin } from '../utils/route'

export default function DistancePick({ entry, onBack, onPickKm }) {
  const { weather } = useWeather(entry.lat, entry.lng)
  const [customOpen, setCustomOpen] = useState(false)
  const [customKm, setCustomKm] = useState('')

  function submitCustom(e) {
    e.preventDefault()
    const km = Number(customKm)
    if (!Number.isFinite(km) || km <= 0 || km > 40) return
    onPickKm(Math.round(km * 10) / 10)
  }

  const sourceLabel =
    entry.source === 'map' ? '지도 위치' : entry.source === 'search' ? '검색 위치' : 'GPS 위치'

  return (
    <section className="screen screen-distance">
      <header className="page-head page-head-tight">
        <button type="button" className="back-btn" onClick={onBack}>
          ← 위치
        </button>
        <div>
          <p className="eyebrow">{sourceLabel}</p>
          <h1>몇 km</h1>
        </div>
      </header>

      <p className="lede lede-compact">오늘 한강에서 얼마나 뛰고 끊을까요?</p>
      {weather ? (
        <p className={`status-note ${weather.wet ? 'is-warn' : ''}`}>
          {weather.temp}° · {weather.label}
          {weather.wet ? ' · 비 대비, 짧게 뛰는 편이 나을 수 있어요' : ''}
        </p>
      ) : null}

      <div className="km-grid">
        {TARGET_KMS.map((km) => (
          <button
            key={km}
            type="button"
            className="km-chip"
            onClick={() => onPickKm(km)}
          >
            <span className="km-num">
              {km}
              <span className="km-unit">km</span>
            </span>
            <span className="km-preview">약 {etaMin(km)}분 · 끊고 가기</span>
          </button>
        ))}
      </div>

      {!customOpen ? (
        <button type="button" className="custom-km-btn" onClick={() => setCustomOpen(true)}>
          직접 설정하기
        </button>
      ) : (
        <form className="custom-km-form" onSubmit={submitCustom}>
          <label className="custom-km-label" htmlFor="custom-km">
            직접 km 입력 (0.5–40)
          </label>
          <div className="custom-km-row">
            <input
              id="custom-km"
              className="custom-km-input"
              type="number"
              inputMode="decimal"
              min="0.5"
              max="40"
              step="0.1"
              placeholder="예: 8.5"
              value={customKm}
              onChange={(e) => setCustomKm(e.target.value)}
              autoFocus
            />
            <button type="submit" className="run-btn custom-km-go">
              확인
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
