import { geoLabel } from '../hooks/useLiveLocation'
import { formatWeatherShort } from '../utils/weather'

export default function LiveMeta({ geo, weather, fallbackName }) {
  const locating = geo.status === 'locating' || geo.status === 'idle'
  const live = geo.status === 'ready'
  const failed = !live && !locating

  return (
    <div className="live-meta">
      <p className={live ? 'live-pill is-live' : 'live-pill'}>
        <span className={live || locating ? 'live-dot is-on' : 'live-dot'} />
        {geoLabel(geo.status, fallbackName)}
        {live && geo.accuracy != null ? ` · ${Math.round(geo.accuracy)}m` : ''}
      </p>
      {weather ? (
        <p className="weather-pill">
          {formatWeatherShort(weather)}
          {weather.wet ? ' · 비 대비' : ''}
        </p>
      ) : null}
      {failed && geo.detail ? <p className="status-note">{geo.detail}</p> : null}
      {failed && typeof geo.retry === 'function' ? (
        <button type="button" className="loc-retry" onClick={geo.retry}>
          위치 다시 읽기
        </button>
      ) : null}
    </div>
  )
}
