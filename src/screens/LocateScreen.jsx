import { useEffect, useState } from 'react'
import EntryMapPicker from '../components/EntryMapPicker'
import PlaceSearch from '../components/PlaceSearch'
import { DEFAULT_CENTER } from '../data/courses'
import { useLiveLocation } from '../hooks/useLiveLocation'
import { isInSeoul } from '../utils/seoul'

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
      setNotice('서울 안에서만 쓸 수 있어요. 한강 근처를 다시 찍어 주세요.')
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

  return (
    <section className="screen screen-locate">
      <header className="home-hero home-hero-tight">
        <p className="eyebrow">한강 · 탈출</p>
        <h1>어디야</h1>
        <p className="lede lede-compact">
          GPS가 잡히면 그대로 쓰고, 아니면 지도나 검색으로 찍으세요.
        </p>
      </header>

      <PlaceSearch
        compact
        onPick={(place) => dropPin(place, 'search')}
      />

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
                : '이 연두 점이 출발점이에요. 지도를 눌러 바꿀 수 있어요.'
        }
      />

      <p className="status-note">
        {locating
          ? 'GPS 찾는 중…'
          : geo.status === 'ready'
            ? `GPS 정확도 약 ${Math.round(geo.accuracy || 0)}m`
            : geo.detail || '지도에서 위치를 찍어 주세요.'}
      </p>
      {notice ? <p className="status-note">{notice}</p> : null}

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
          <button type="button" className="loc-retry map-secondary" onClick={geo.retry}>
            GPS 다시 읽기
          </button>
        ) : null}
      </div>
    </section>
  )
}
