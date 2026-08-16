import { useCallback, useEffect, useRef, useState } from 'react'

const WATCH_OPTS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
const SOFT_OPTS = { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }

function statusFromError(err) {
  if (!err) return 'error'
  if (err.code === err.PERMISSION_DENIED) return 'denied'
  if (err.code === err.TIMEOUT) return 'timeout'
  if (err.code === err.POSITION_UNAVAILABLE) return 'unavailable'
  return 'error'
}

function detailFromError(err) {
  if (!err) return ''
  if (err.code === err.PERMISSION_DENIED) {
    return '브라우저 주소창 왼쪽 자물쇠/ⓘ → 위치 → 허용'
  }
  if (err.code === err.TIMEOUT) {
    return '시간이 초과됐어요. Windows 설정에서 위치 서비스를 켠 뒤 다시 시도하세요.'
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'PC는 GPS가 약할 수 있어요. Wi‑Fi를 켠 뒤 다시 시도하거나, 폰 브라우저로 열어 보세요.'
  }
  return err.message || '위치를 읽지 못했어요.'
}

export function useLiveLocation() {
  const [coords, setCoords] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [tick, setTick] = useState(0)
  const watchRef = useRef(null)

  const applyPos = useCallback((pos) => {
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    setAccuracy(pos.coords.accuracy)
    setStatus('ready')
    setDetail('')
  }, [])

  const retry = useCallback(() => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unsupported')
      setDetail('이 브라우저는 위치를 지원하지 않아요.')
      return undefined
    }

    if (!window.isSecureContext) {
      setStatus('error')
      setDetail('http://127.0.0.1 또는 https로 열어 주세요.')
      return undefined
    }

    let cancelled = false
    setStatus('locating')
    setDetail('')

    const clearWatch = () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }

    const startWatch = () => {
      clearWatch()
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!cancelled) applyPos(pos)
        },
        () => {
          // watch 실패는 첫 좌표가 있을 때 무시. 없을 때만 아래에서 처리.
        },
        WATCH_OPTS,
      )
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return
        applyPos(pos)
        startWatch()
      },
      () => {
        if (cancelled) return
        // PC·실내에서는 고정밀이 자주 타임아웃 → 저정밀로 한 번 더
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return
            applyPos(pos)
            startWatch()
          },
          (err) => {
            if (cancelled) return
            setStatus(statusFromError(err))
            setDetail(detailFromError(err))
          },
          SOFT_OPTS,
        )
      },
      WATCH_OPTS,
    )

    return () => {
      cancelled = true
      clearWatch()
    }
  }, [tick, applyPos])

  return { coords, accuracy, status, detail, retry }
}

export function geoLabel(status, fallbackName) {
  if (status === 'ready') return '실시간 위치 추적 중'
  if (status === 'locating' || status === 'idle') return '위치 찾는 중'
  if (status === 'denied') return `위치 꺼짐 · ${fallbackName} 기준`
  if (status === 'timeout') return `위치 시간 초과 · ${fallbackName} 기준`
  if (status === 'unavailable') return `위치 신호 없음 · ${fallbackName} 기준`
  if (status === 'unsupported') return `이 기기는 위치 없음 · ${fallbackName} 기준`
  return `위치를 못 읽음 · ${fallbackName} 기준`
}
