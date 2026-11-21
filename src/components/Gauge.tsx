import { clamp } from '../lib/math.ts'

export function Gauge({ score }: { score: number }) {
  const position = clamp((score + 100) / 200, 0, 1) * 100
  return (
    <div className="gauge" role="img" aria-label={`分數 ${score.toFixed(1)}，左是空頭，右是多頭`}>
      <div className="gauge-scale">
        <span className="gauge-knob" style={{ left: `${position}%` }} />
      </div>
      <div className="gauge-ends">
        <span>空</span>
        <span>多</span>
      </div>
    </div>
  )
}

export function Meter({ score, label }: { score: number; label?: string }) {
  const position = clamp((score + 100) / 2, 0, 100)
  return (
    <div className="meter" aria-hidden={label ? undefined : true} aria-label={label}>
      <span className="meter-track" />
      <span className="meter-mark" style={{ left: `${position}%` }} />
    </div>
  )
}
