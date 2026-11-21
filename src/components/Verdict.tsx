import type { ScoreIntervalId } from '../config.ts'
import { formatSigned, formatWeight } from '../lib/format.ts'
import { labelFor, toneOf, type CompositeScore } from '../lib/score.ts'
import { Gauge, Meter } from './Gauge.tsx'

export function Verdict({
  score,
  summary,
  onSelectFrame,
}: {
  score: CompositeScore | null
  summary: string[] | null
  onSelectFrame: (id: ScoreIntervalId) => void
}) {
  if (!score || !summary) {
    return (
      <section className="decision">
        <article className="card verdict-card">
          <p className="eyebrow">綜合判定</p>
          <h2 className="verdict-word tone-na">無法判斷</h2>
          <p className="verdict-copy">週線、日線或四小時 K 線沒有取齊，這次不算總分。可以按重整再試一次。</p>
        </article>
      </section>
    )
  }

  const tone = toneOf(score.signal)
  const verdict = labelFor(score.signal, 'composite')

  return (
    <section className="decision" aria-labelledby="verdict-title">
      <article className={`card verdict-card tone-${tone}`}>
        <p className="eyebrow">綜合判定</p>
        <Gauge score={score.score} />
        <h2 id="verdict-title" className={`verdict-word tone-${tone}`}>
          {verdict}
        </h2>
        <p className="score-num">
          <span>{formatSigned(score.score, 1)}</span>
          <small>/ 100</small>
        </p>
        <p className="verdict-range">−100 空頭 · +100 多頭</p>
        <p className="not-advice">不是投資建議</p>
        {score.renormNote ? <p className="note">{score.renormNote}</p> : null}
      </article>
      <article className="card summary-card">
        <p className="eyebrow">現在的狀態</p>
        <div className="summary">
          {summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="tf-list">
          {score.frames.map((frame) => (
            <button key={frame.id} type="button" className="tf-row" onClick={() => onSelectFrame(frame.id)}>
              <span className="tf-name">{frame.label}</span>
              <span className={`pill ${toneOf(frame.signal)}`}>{labelFor(frame.signal, 'composite')}</span>
              <Meter score={frame.score} />
              <span className="tf-score">{formatSigned(frame.score, 1)}</span>
              <span className="tf-weight">權重 {formatWeight(frame.effectiveWeight)}</span>
            </button>
          ))}
        </div>
      </article>
    </section>
  )
}
