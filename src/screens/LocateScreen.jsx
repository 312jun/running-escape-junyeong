import { useEffect, useState } from 'react'
import EntryMapPicker from '../components/EntryMapPicker'
import PlaceSearch from '../components/PlaceSearch'
import StepBar from '../components/StepBar'
import { DEFAULT_CENTER } from '../data/courses'
import { useLiveLocation } from '../hooks/useLiveLocation'
import { isInSeoul } from '../utils/seoul'

function gpsChip(geo, locating, gpsFailed) {
  if (locating) return { className: 'gps-chip is-wait', text: 'GPS 찾는 중' }
  if (geo.status === 'ready') {
    return {
      className: 'gps-chip is-on',
      text: `GPS · 약 ${Math.round(geo.accuracy || 0)}m`,
    }
  }
  if (gpsFailed) return { className: 'gps-chip is-off', text: 'GPS 없음 · 지도로 찍기' }
  return { className: 'gps-chip', text: '위치 확인' }
}

export default function LocateScreen({ onLocated }) {
  const geo = useLiveLocation()
  const [pin, setPin] = useState(null)
  const [notice, setNotice] = useState('')
  const [userPinned, setUserPinned] = useState(false)

  useEffect(() => {
    if (userPinned) return
    if (geo.status === 'ready' && geo.coords) {
      setPin(geo.coords)
    }
  }, [geo.status, geo.coords, userPinned])

  const locating = geo.status === 'locating' || geo.status === 'idle'
  const gpsFailed =
    geo.status === 'denied' ||
    geo.status === 'timeout' ||
    geo.status === 'unavailable' ||
    geo.status === 'error' ||
    geo.status === 'unsupported'

  function commit(point) {
    if (!isInSeoul(point.lat, point.lng)) {
      setNotice('서울 한강 구간에서만 쓸 수 있어요. 지도를 조금 옮겨 찍어 주세요.')
      return
    }
    setNotice('')
    onLocated(point)
  }

  function dropPin(point, source) {
    setUserPinned(true)
    setPin({ lat: point.lat, lng: point.lng, name: point.name, source })
    setNotice('')
  }

  const readyPoint = pin || geo.coords
  const chip = gpsChip(geo, locating, gpsFailed)

  return (
    <section className="screen screen-locate">
      <StepBar step={0} />
      <header className="home-hero home-hero-tight">
        <p className="eyebrow">뛰다 · 끊기</p>
        <h1>한강탈출</h1>
        <p className="lede lede-compact">
          한강에 들어간 자리를 찍으면, 그 거리에서 끊을 곳을 찾아 줘요.
        </p>
      </header>

      <PlaceSearch compact onPick={(place) => dropPin(place, 'search')} />

      <EntryMapPicker
        center={pin ?? geo.coords ?? DEFAULT_CENTER}
        pin={pin}
        live={userPinned ? geo.coords : null}
        onPick={(pt) => dropPin(pt, 'map')}
        hint={
          locating
            ? '위치를 찾는 중이에요. 지도를 눌러 바로 찍어도 됩니다.'
            : gpsFailed
              ? 'GPS를 못 읽었어요. 지도를 누르거나 위를 검색하세요.'
              : userPinned
                ? '파란 점 = 지금 GPS · 연두 점 = 출발로 쓸 위치'
                : '연두 점이 출발점이에요. 지도를 눌러 바꿀 수 있어요.'
        }
      />

      <div className={chip.className}>
        <span className={locating || geo.status === 'ready' ? 'live-dot is-on' : 'live-dot'} />
        {chip.text}
      </div>
      {geo.detail && gpsFailed ? <p className="status-note">{geo.detail}</p> : null}
      {notice ? <p className="status-note is-warn">{notice}</p> : null}

      <div className="sticky-run">
        <button
          type="button"
          className="run-btn"
          disabled={!readyPoint}
          onClick={() =>
            commit({
              ...readyPoint,
              source: pin?.source || (geo.status === 'ready' ? 'gps' : 'map'),
            })
          }
        >
          이 위치로
        </button>
        {gpsFailed || geo.status === 'ready' ? (
          <button type="button" className="ghost-btn" onClick={geo.retry}>
            GPS 다시 읽기
          </button>
        ) : null}
      </div>
    </section>
  )
}
