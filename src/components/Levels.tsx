import { formatSignedPct, formatUsd } from '../lib/format.ts'
import type { PriceLevel } from '../lib/levels.ts'

export function Levels({ levels, price }: { levels: PriceLevel[]; price: number | null }) {
  const resistances = levels.filter((level) => level.side === 'resistance')
  const supports = levels.filter((level) => level.side === 'support')
  return (
    <section className="card levels" aria-labelledby="levels-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">價格位置</p>
          <h2 id="levels-title">支撐與壓力</h2>
        </div>
      </div>
      <p className="levels-lead">
        取日線與四小時已確認的擺動高點、低點，距離太近的會併成同一區。價格上方是壓力，下方是支撐。
      </p>
      {levels.length === 0 || price == null ? (
        <p className="empty-copy">目前沒有足夠的擺動點。</p>
      ) : (
        <ol className="ladder">
          {resistances.map((level) => (
            <li key={level.id}>
              <LevelRow level={level} />
            </li>
          ))}
          <li className="ladder-now">
            <span>現價</span>
            <strong>{formatUsd(price)}</strong>
            <em>BTC / USDT</em>
          </li>
          {supports.map((level) => (
            <li key={level.id}>
              <LevelRow level={level} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function LevelRow({ level }: { level: PriceLevel }) {
  return (
    <div className={`ladder-row ${level.side}`}>
      <span>{level.side === 'resistance' ? '壓力' : '支撐'}</span>
      <strong>{formatUsd(level.price)}</strong>
      <em>{formatSignedPct(level.distancePct, 1)}</em>
      <small>{level.label}</small>
    </div>
  )
}
