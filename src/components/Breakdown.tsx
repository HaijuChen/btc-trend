import { SCORE_BAND, type ScoreIntervalId } from '../config.ts'
import { formatSigned, formatWeight } from '../lib/format.ts'
import { labelFor, toneOf, type CompositeScore, type TimeframeReading } from '../lib/score.ts'
import { Meter } from './Gauge.tsx'

export function Breakdown({
  score,
  active,
  onActive,
}: {
  score: CompositeScore | null
  active: ScoreIntervalId
  onActive: (id: ScoreIntervalId) => void
}) {
  const frame = score?.frames.find((item) => item.id === active) ?? score?.frames[0] ?? null
  return (
    <section className="card breakdown" id="breakdown">
      <div className="section-head">
        <div>
          <p className="eyebrow">分數怎麼來的</p>
          <h2>指標拆解</h2>
        </div>
        {score ? (
          <div className="segment" role="tablist" aria-label="計分週期">
            {score.frames.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={frame?.id === item.id}
                className={frame?.id === item.id ? 'is-on' : ''}
                onClick={() => onActive(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {frame ? <FrameDetail frame={frame} /> : <p className="empty-copy">沒有可以拆開的指標。請確認 K 線有讀到。</p>}
      <details className="method">
        <summary>權重與門檻</summary>
        <p>
          每個指標先得到 −100 到 +100。均線排列 22%、價格對 EMA200 16%、MACD 18%、RSI 12%、ADX / DMI 16%、布林位置
          8%、量能 8%，加總成該週期分數。週線再占 45%、日線 35%、四小時 20%。
        </p>
        <p>
          總分 ≥ {SCORE_BAND.strong} 為強烈多頭，≥ {SCORE_BAND.lean} 為偏多；≤ −{SCORE_BAND.lean} 為偏空，≤ −
          {SCORE_BAND.strong} 為強烈空頭，中間是中性。15 分與 1 小時只供看圖。某個來源失敗時，其餘項目會把權重補滿。
        </p>
        <p>RSI 在這裡看成動能方向。超買仍可能算偏多，超賣仍可能算偏空，不會自動反向。</p>
      </details>
    </section>
  )
}

function FrameDetail({ frame }: { frame: TimeframeReading }) {
  return (
    <div>
      <div className="frame-score">
        <span className={`pill ${toneOf(frame.signal)}`}>{labelFor(frame.signal, 'composite')}</span>
        <strong>{formatSigned(frame.score, 1)}</strong>
        <span>此週期貢獻 {formatSigned(frame.effectiveWeight * frame.score, 1)}</span>
      </div>
      {frame.renormNote ? <p className="note">{frame.renormNote}</p> : null}
      <ul className="ind-list">
        {frame.indicators.map((indicator) => {
          const contribution = indicator.effectiveWeight * indicator.score
          return (
            <li key={indicator.id} className="ind-row">
              <div className="ind-top">
                <span className="ind-name">{indicator.name}</span>
                <span className={`pill ${toneOf(indicator.signal)}`}>{labelFor(indicator.signal, 'indicator')}</span>
              </div>
              <Meter score={indicator.available ? indicator.score : 0} />
              <p className="ind-reason">{indicator.reason}</p>
              <p className="ind-meta">
                <span>權重 {formatWeight(indicator.effectiveWeight)}</span>
                <span>分數 {indicator.available ? formatSigned(indicator.score, 1) : '—'}</span>
                <span>貢獻 {indicator.available ? formatSigned(contribution, 1) : '—'}</span>
                {indicator.detail ? <span className="ind-detail">{indicator.detail}</span> : null}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
