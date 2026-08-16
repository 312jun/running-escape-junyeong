import { LINE_COLORS } from '../data/courses'

export default function LineBadge({ line }) {
  const color = LINE_COLORS[line] || '#8899aa'
  let label = line
  if (line === '버스') label = '버스'
  else if (line === '지하철') label = '지하철'
  else if (line === '경의중앙') label = '경의중앙'
  else if (/^\d+$/.test(String(line))) label = String(line)

  return (
    <span className="line-badge" style={{ background: color }}>
      {label}
    </span>
  )
}
