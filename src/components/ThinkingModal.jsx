import { useEffect, useState } from 'react'

const STEPS = [
  '서울 강·하천 기준점을 잡는 중',
  '날씨와 혼잡을 보는 중',
  '탈출점을 고르는 중',
  '도로 따라 거리를 재는 중',
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
    }, 1700)

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

        <p className="think-eyebrow">{targetKm}km · 서울</p>
        <h2 className="think-title">길을 보는 중</h2>
        <p key={step} className="think-step">
          {STEPS[step]}
        </p>

        <div className="think-track" aria-hidden="true">
          <span className="think-track-fill" />
          <span className="think-track-dot" />
        </div>

        <p className="think-hint">{step + 1} / {STEPS.length}</p>
        <p className="think-wait">최대 30초 정도 걸릴 수 있어요</p>
      </div>
    </div>
  )
}
