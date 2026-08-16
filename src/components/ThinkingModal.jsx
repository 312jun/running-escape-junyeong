import { useEffect, useState } from 'react'

const STEPS = [
  '한강 진입점을 확인하는 중',
  '오늘 기상 상황을 보는 중',
  '한강 이벤트·혼잡을 짚는 중',
  '근처 지하철·버스를 찾는 중',
  '목표 거리에 맞는 끊을 곳을 고르는 중',
]

export default function ThinkingModal({ targetKm, open }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!open) {
      setStep(0)
      return undefined
    }

    const id = window.setInterval(() => {
      setStep((n) => (n + 1) % STEPS.length)
    }, 1600)

    return () => window.clearInterval(id)
  }, [open])

  if (!open) return null

  return (
    <div className="think-modal" role="dialog" aria-modal="true" aria-live="polite">
      <div className="think-scrim" />
      <div className="think-card">
        <div className="think-orbit" aria-hidden="true">
          <span className="think-ring" />
          <span className="think-ring think-ring-2" />
          <span className="think-runner" />
        </div>

        <p className="think-eyebrow">{targetKm}km · Gemini</p>
        <h2 className="think-title">길을 보는 중</h2>
        <p key={step} className="think-step">
          {STEPS[step]}
        </p>

        <div className="think-track" aria-hidden="true">
          <span className="think-track-fill" />
          <span className="think-track-dot" />
        </div>

        <ul className="think-checklist">
          {STEPS.map((label, i) => (
            <li key={label} className={i <= step ? 'is-on' : ''}>
              <span className="think-check" />
              {label.replace(' 중', '')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
