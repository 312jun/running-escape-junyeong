import { useEffect, useRef, useState } from 'react'
import { searchSeoulPlaces } from '../utils/seoul'

export default function PlaceSearch({ onPick, compact = false }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const timer = useRef(null)

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setStatus('idle')
      setError('')
      return undefined
    }

    setStatus('loading')
    timer.current = window.setTimeout(() => {
      searchSeoulPlaces(q)
        .then((list) => {
          setHits(list)
          setStatus(list.length ? 'ready' : 'empty')
          setError('')
        })
        .catch(() => {
          setHits([])
          setStatus('error')
          setError('검색을 못 했어요. 잠시 후 다시 시도하세요.')
        })
    }, 350)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [query])

  return (
    <div className={compact ? 'place-search is-compact' : 'place-search'}>
      {compact ? null : (
        <label className="custom-km-label" htmlFor="place-q">
          장소 검색 (서울만)
        </label>
      )}
      <input
        id="place-q"
        className="custom-km-input place-search-input"
        type="search"
        placeholder="여의도한강공원, 반포…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {status === 'loading' ? <p className="status-note">검색 중…</p> : null}
      {status === 'empty' ? <p className="status-note">서울 안 결과가 없어요.</p> : null}
      {error ? <p className="status-note">{error}</p> : null}
      {hits.length > 0 ? (
        <ul className="place-hits">
          {hits.map((hit) => (
            <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
              <button
                type="button"
                className="place-hit"
                onClick={() => {
                  onPick({ lat: hit.lat, lng: hit.lng, name: hit.name, source: 'search' })
                  setQuery(hit.name)
                  setHits([])
                }}
              >
                <span className="place-hit-name">{hit.name}</span>
                <span className="place-hit-label">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
