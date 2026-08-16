import { useState } from 'react'
import LocateScreen from './screens/LocateScreen'
import DistancePick from './screens/DistancePick'
import EscapeNow from './screens/EscapeNow'
import './App.css'

export default function App() {
  const [screen, setScreen] = useState('locate')
  const [entry, setEntry] = useState(null)
  const [targetKm, setTargetKm] = useState(null)

  function onLocated(point) {
    setEntry(point)
    setTargetKm(null)
    setScreen('distance')
  }

  function backToLocate() {
    setScreen('locate')
    setEntry(null)
    setTargetKm(null)
  }

  function pickKm(km) {
    setTargetKm(km)
    setScreen('escape')
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
