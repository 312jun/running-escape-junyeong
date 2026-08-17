const STEPS = ['위치', '거리', '길']

export default function StepBar({ step }) {
  return (
    <ol className="step-bar" aria-label="진행 단계">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i === step ? 'is-now' : i < step ? 'is-done' : ''}
        >
          <span className="step-dot" />
          {label}
        </li>
      ))}
    </ol>
  )
}
