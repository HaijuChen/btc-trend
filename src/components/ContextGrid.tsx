import { useEffect, useState } from 'react'
import {
  formatBtcAmount,
  formatCompactUsd,
  formatCountdown,
  formatFunding,
  formatNumber,
  formatShortDate,
  formatSignedPct,
  formatTaipei,
} from '../lib/format.ts'
import { dominanceNote, fearNote, fundingNote, longShortNote } from '../lib/notes.ts'
import type { FearGreed, Funding, GlobalMarket, LongShort, OpenInterest } from '../types.ts'

export function ContextGrid({
  fear,
  fearError,
  funding,
  fundingError,
  openInterest,
  oiError,
  longShort,
  lsError,
  global,
  globalError,
}: {
  fear: FearGreed | null
  fearError: string | null
  funding: Funding | null
  fundingError: string | null
  openInterest: OpenInterest | null
  oiError: string | null
  longShort: LongShort | null
  lsError: string | null
  global: GlobalMarket | null
  globalError: string | null
}) {
  return (
    <section className="context" aria-labelledby="context-title">
      <div className="section-title">
        <h2 id="context-title">市場狀態</h2>
        <p>情緒、合約與全市場，用來對照上面的技術分數。</p>
      </div>
      <div className="metrics">
        <article className="card metric">
          <header>
            <h3>恐懼與貪婪</h3>
            <span>{fear?.source ?? 'Alternative.me'}</span>
          </header>
          {fear ? (
            <>
              <p className="metric-value">{fear.value}</p>
              <p className="metric-label">{fear.label}</p>
              <div className="fear-track" aria-hidden="true">
                <span style={{ left: `${fear.value}%` }} />
              </div>
              <p>{fearNote(fear.value, fear.label)}</p>
              {fear.updatedAt ? <p className="metric-foot">指數日期 {formatShortDate(fear.updatedAt)}</p> : null}
            </>
          ) : (
            <p className="miss">{fearError}</p>
          )}
        </article>

        <article className="card metric">
          <header>
            <h3>資金費率</h3>
            <span>{funding?.source ?? '永續合約'}</span>
          </header>
          {funding ? (
            <>
              <p className={`metric-value ${funding.rate >= 0 ? 'tone-bull' : 'tone-bear'}`}>{formatFunding(funding.rate)}</p>
              <p>{fundingNote(funding.rate)}</p>
              {funding.nextTime ? <Settlement target={funding.nextTime} /> : <p className="metric-foot">這筆來源沒有給下次結算時間。</p>}
            </>
          ) : (
            <p className="miss">{fundingError}</p>
          )}
        </article>

        <article className="card metric">
          <header>
            <h3>未平倉量</h3>
            <span>{openInterest?.source ?? '永續合約'}</span>
          </header>
          {openInterest ? (
            <>
              <p className="metric-value">{formatBtcAmount(openInterest.btc)}</p>
              <p>{openInterest.usd == null ? '沒有換算成美元。' : `約 ${formatCompactUsd(openInterest.usd)}。`}</p>
              <p className="metric-foot">這是該交易所永續合約的未平倉，不是全市場加總。</p>
            </>
          ) : (
            <p className="miss">{oiError}</p>
          )}
        </article>

        <article className="card metric">
          <header>
            <h3>多空比</h3>
            <span>{longShort?.source ?? '永續合約'}</span>
          </header>
          {longShort ? <LongShortBody data={longShort} /> : <p className="miss">{lsError}</p>}
        </article>

        <article className="card metric">
          <header>
            <h3>比特幣占比</h3>
            <span>{global?.source ?? 'CoinGecko'}</span>
          </header>
          {global ? (
            <>
              <p className="metric-value">{formatNumber(global.btcDominance, 1)}%</p>
              <p>{dominanceNote(global.btcDominance)}</p>
            </>
          ) : (
            <p className="miss">{globalError}</p>
          )}
        </article>

        <article className="card metric">
          <header>
            <h3>加密貨幣總市值</h3>
            <span>{global?.source ?? 'CoinGecko'}</span>
          </header>
          {global ? (
            <>
              <p className="metric-value">{formatCompactUsd(global.totalMarketCapUsd)}</p>
              <p>
                {global.marketCapChange24h == null
                  ? '沒有 24 小時變化。'
                  : `24 小時 ${formatSignedPct(global.marketCapChange24h)}。`}
              </p>
            </>
          ) : (
            <p className="miss">{globalError}</p>
          )}
        </article>
      </div>
    </section>
  )
}

function Settlement({ target }: { target: number }) {
  const [remain, setRemain] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setRemain(formatCountdown(target, Date.now()))
    const kick = window.setTimeout(update, 0)
    const timer = window.setInterval(update, 30_000)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(timer)
    }
  }, [target])
  return (
    <p className="metric-foot">
      下次結算 {formatTaipei(target, false)}
      {remain ? ` · ${remain}` : ''}
    </p>
  )
}

function LongShortBody({ data }: { data: LongShort }) {
  return (
    <>
      <p className="metric-value">{formatNumber(data.ratio, 2)}</p>
      <div className="split" aria-hidden="true">
        <span className="split-long" style={{ width: `${data.longPct}%` }} />
        <span className="split-short" style={{ width: `${data.shortPct}%` }} />
      </div>
      <p>
        多 {formatNumber(data.longPct, 1)}% · 空 {formatNumber(data.shortPct, 1)}%
      </p>
      <p>{longShortNote(data.longPct)}</p>
      <p className="metric-foot">這是該交易所的帳戶數比例，不是全市場保證金。</p>
    </>
  )
}
