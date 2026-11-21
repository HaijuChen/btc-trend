import { useEffect, useState } from 'react'
import { REFRESH_MS } from '../config.ts'
import { formatCompactUsd, formatSignedPct, formatTaipei, formatTaipeiClock, formatTwd, formatUsd } from '../lib/format.ts'
import { toneOf, type Signal } from '../lib/score.ts'
import type { Ticker } from '../types.ts'

function Clock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <time dateTime={new Date(now).toISOString()}>{formatTaipeiClock(now)}</time>
}

function Countdown({ updatedAt, refreshing }: { updatedAt: number | null; refreshing: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (refreshing) return <span>指標更新中</span>
  if (updatedAt == null) return <span>等待第一筆資料</span>
  const remain = Math.max(0, Math.ceil((REFRESH_MS - (now - updatedAt)) / 1000))
  return <span>{remain} 秒後重算指標</span>
}

export function PriceBar({
  ticker,
  verdict,
  signal,
  refreshing,
  onRefresh,
}: {
  ticker: Ticker | null
  verdict: string | null
  signal: Signal | null
  refreshing: boolean
  onRefresh: () => void
}) {
  const tone = signal ? toneOf(signal) : 'neutral'
  return (
    <header className="topbar">
      <div className="wrap bar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <h1>BTC 多空判讀</h1>
            <p>
              <span className="live-dot" aria-hidden="true" />
              台北時間 <Clock />
            </p>
          </div>
        </div>
        <div className="bar-side">
          {ticker ? (
            <div className="bar-quote">
              <span className="bar-price">{formatUsd(ticker.price)}</span>
              <span className={`pill ${ticker.changePercent >= 0 ? 'bull' : 'bear'}`}>
                {ticker.changePercent >= 0 ? '▲' : '▼'} {formatSignedPct(ticker.changePercent)}
              </span>
              {verdict ? <span className={`pill ${tone}`}>{verdict}</span> : null}
            </div>
          ) : (
            <span className="bar-wait">讀取報價</span>
          )}
          <button type="button" className="refresh" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '更新中' : '重整'}
          </button>
        </div>
      </div>
    </header>
  )
}

export function MarketStrip({
  ticker,
  twd,
  updatedAt,
  refreshing,
  priceLive,
}: {
  ticker: Ticker
  twd: number | null
  updatedAt: number | null
  refreshing: boolean
  priceLive: boolean
}) {
  return (
    <section className="strip" aria-label="24 小時行情">
      <dl>
        <div>
          <dt>24 小時高</dt>
          <dd>{ticker.high == null ? '—' : formatUsd(ticker.high)}</dd>
        </div>
        <div>
          <dt>24 小時低</dt>
          <dd>{ticker.low == null ? '—' : formatUsd(ticker.low)}</dd>
        </div>
        <div>
          <dt>24 小時成交額</dt>
          <dd>{ticker.quoteVolume == null ? '—' : formatCompactUsd(ticker.quoteVolume)}</dd>
        </div>
        <div>
          <dt>約合台幣</dt>
          <dd>{twd == null ? '—' : formatTwd(twd)}</dd>
        </div>
      </dl>
      <p className="strip-meta">
        <span>{priceLive ? `${ticker.source}即時報價` : `報價來源 ${ticker.source}`}</span>
        <span>{updatedAt == null ? '尚未更新' : `${formatTaipei(updatedAt)} 台北`}</span>
        <Countdown updatedAt={updatedAt} refreshing={refreshing} />
      </p>
    </section>
  )
}
