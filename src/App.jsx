import { useState } from 'react'
import LocateScreen from './screens/LocateScreen'
import DistancePick from './screens/DistancePick'
import EscapeNow from './screens/EscapeNow'
import { useScreenMeta } from './hooks/useScreenMeta'
import { trackEvent } from './utils/ga'
import './App.css'

export default function App() {
  const [screen, setScreen] = useState('locate')
  const [entry, setEntry] = useState(null)
  const [targetKm, setTargetKm] = useState(null)

  useScreenMeta(screen)

  function onLocated(point) {
    setEntry(point)
    setTargetKm(null)
    setScreen('distance')
    trackEvent('select_location', { method: point?.source || 'unknown' })
  }

  function backToLocate() {
    setScreen('locate')
    setEntry(null)
    setTargetKm(null)
  }

  function pickKm(km) {
    setTargetKm(km)
    setScreen('escape')
    trackEvent('select_distance', { value: km })
  }

  function backToDistance() {
    setScreen('distance')
  }

  return (
    <div className="app-shell">
      {screen === 'locate' && <LocateScreen onLocated={onLocated} />}

      {screen === 'distance' && entry && (
        <DistancePick entry={entry} onBack={backToLocate} onPickKm={pickKm} />
      )}

      {screen === 'escape' && entry && targetKm != null && (
        <EscapeNow entry={entry} targetKm={targetKm} onBack={backToDistance} />
      )}
    </div>
  )
}
