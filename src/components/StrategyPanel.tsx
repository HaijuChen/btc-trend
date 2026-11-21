import { useState } from 'react'
import { formatNumber, formatSigned, formatSignedPct, formatTaipei, formatTaipeiShort, formatUsd } from '../lib/format.ts'
import {
  liveFilter,
  positionMove,
  type Side,
  type StrategyAnalysis,
  type StrategyEvent,
  type StrategyTrade,
} from '../lib/strategy.ts'

const RECENT = 8

function sideLabel(side: Side | null): string {
  if (side === 'long') return '做多'
  if (side === 'short') return '做空'
  return '空手'
}

function toneOf(side: Side | null): 'bull' | 'bear' | 'neutral' {
  if (side === 'long') return 'bull'
  if (side === 'short') return 'bear'
  return 'neutral'
}

function formatR(value: number): string {
  return `${formatSigned(value, 2)}R`
}

function formatStopDistance(percent: number): string {
  if (percent >= 0) return `${formatNumber(percent)}%`
  return `已穿過 ${formatNumber(Math.abs(percent))}%`
}

function eventText(event: StrategyEvent): string {
  const when = formatTaipei(event.time * 1000, false)
  const price = formatUsd(event.price)
  if (event.kind === 'stop') return `${when} 停損出場，價格 ${price}`
  if (event.kind === 'reverse') return `${when} 反手${sideLabel(event.side)}，價格 ${price}`
  return `${when} 理論${sideLabel(event.side)}，進場價 ${price}`
}

function reasonLabel(reason: StrategyTrade['reason']): string {
  return reason === 'stop' ? '停損' : '反手'
}

export function StrategyPanel({
  analysis,
  source,
  error,
  price,
}: {
  analysis: StrategyAnalysis | null
  source: string | null
  error: string | null
  price: number | null
}) {
  const [filterOn, setFilterOn] = useState(false)
  const position = analysis?.position ?? null
  const side = position?.side ?? null
  const move = position && price != null ? positionMove(position, price) : null
  const filter = analysis ? liveFilter(analysis, price) : null
  const crossed =
    position != null &&
    price != null &&
    (position.side === 'long' ? price <= position.stop : price >= position.stop)
  const recent = analysis ? analysis.trades.slice(-RECENT).reverse() : []
  const latest = analysis && analysis.events.length > 0 ? analysis.events[analysis.events.length - 1] : null

  return (
    <section className={`card strategy-card tone-${toneOf(side)}`} id="strategy" aria-label="長線策略參考訊號">
      <div className="section-head">
        <div>
          <p className="eyebrow">參考信號</p>
          <h2>長線策略參考訊號</h2>
        </div>
        <span className="pill na">BTC/USDT · 4 小時</span>
      </div>

      <div className="callout" role="note">
        <p>
          <strong>參考信號，不是下單，也不是投資建議。</strong>
        </p>
        <p>
          這裡用已收盤的 BTC/USDT 四小時 K 線，把唐奇安通道突破和 ATR 移動停損從頭逐根重播，得到一個理論部位。它不是交易所裡的委託。這套策略的樣本外測試是 −1.2R。來源機器人目前只管理已經有的部位，不會新開比特幣倉位。
        </p>
      </div>

      {error || !analysis ? (
        <p className="empty-copy">{error ?? '四小時 K 線還在讀取，參考訊號稍後才重播。'}</p>
      ) : (
        <>
          <p className={`strategy-state tone-${toneOf(side)}`}>{sideLabel(side)}</p>
          <p className="strategy-kicker">理論重播的狀態。不是帳戶裡的持倉。</p>
          <p className="strategy-event">
            {latest ? eventText(latest) : '這段已收盤的歷史裡還沒有理論進出場。'}
            {analysis.filledOnForming ? ' 成交價用的是尚未收盤這根 4 小時的開盤。' : ''}
          </p>
          {analysis.pending && !analysis.filledOnForming ? (
            <p className="strategy-event">
              {analysis.pending.action === 'reverse' ? '上一根收盤觸及反向突破，' : '上一根收盤已排出訊號，'}
              理論上會在下一根開盤{sideLabel(analysis.pending.side)}。目前這筆還沒有成交價。
            </p>
          ) : null}
          {analysis.formingTouchedStop || crossed ? (
            <p className="strategy-event">
              這根尚未收盤的 4 小時，價格已經碰到停損。理論部位要等這根收盤、重新重播之後才會改。
            </p>
          ) : null}

          <dl className="strategy-stats">
            <div>
              <dt>理論進場</dt>
              <dd>{position ? formatUsd(position.entryPrice) : '—'}</dd>
            </div>
            <div>
              <dt>進場時間</dt>
              <dd>{position ? formatTaipei(position.entryTime * 1000, false) : '—'}</dd>
            </div>
            <div>
              <dt>移動停損</dt>
              <dd>{position ? formatUsd(position.stop) : '—'}</dd>
            </div>
            <div>
              <dt>離停損</dt>
              <dd>{move ? formatStopDistance(move.stopPercent) : '—'}</dd>
            </div>
            <div>
              <dt>通道高</dt>
              <dd>{analysis.hh == null ? '—' : formatUsd(analysis.hh)}</dd>
            </div>
            <div>
              <dt>通道低</dt>
              <dd>{analysis.ll == null ? '—' : formatUsd(analysis.ll)}</dd>
            </div>
            <div>
              <dt>ATR(14)</dt>
              <dd>{analysis.atr == null ? '—' : formatNumber(analysis.atr)}</dd>
            </div>
            <div>
              <dt>已持有</dt>
              <dd>{position ? (position.barsHeld === 0 ? '未滿 1 根' : `${position.barsHeld} 根`) : '—'}</dd>
            </div>
            <div>
              <dt>未實現</dt>
              <dd>{move ? `${formatR(move.rMultiple)} · ${formatSignedPct(move.percent)}` : '—'}</dd>
            </div>
          </dl>

          <div className="filter-row">
            <button
              type="button"
              className={filterOn ? 'legend-btn is-on' : 'legend-btn'}
              aria-pressed={filterOn}
              onClick={() => setFilterOn((value) => !value)}
            >
              <i style={{ background: '#e0b15a' }} />
              實盤濾網
            </button>
            <p className="filter-note">{filterOn ? filterCopy(filter, side) : '濾網關閉。理論部位照整段重播顯示，不會因為訊號較舊，或現價已經離開觸發價，就把部位拿掉。'}</p>
          </div>

          <h3 className="trade-title">最近平倉的理論交易</h3>
          {analysis.trades.length > RECENT ? (
            <p className="trade-caption">重播共 {analysis.trades.length} 筆平倉，這裡列最近 {RECENT} 筆。R 是進場當下的 3×ATR。</p>
          ) : (
            <p className="trade-caption">R 是進場當下的 3×ATR。這些是重播裡的平倉，不是成交回報。</p>
          )}
          {recent.length === 0 ? (
            <p className="empty-copy">這段已收盤的 4 小時裡還沒有平倉的理論交易。</p>
          ) : (
            <ol className="trade-list">
              {recent.map((trade) => (
                <li key={`${trade.entryTime}-${trade.exitTime}-${trade.side}`} className="trade-row">
                  <span className={`pill trade-side ${trade.side === 'long' ? 'bull' : 'bear'}`}>{sideLabel(trade.side)}</span>
                  <span className="trade-when">
                    {formatTaipeiShort(trade.entryTime * 1000)} → {formatTaipeiShort(trade.exitTime * 1000)}
                  </span>
                  <span className={`trade-r ${trade.rMultiple >= 0 ? 'tone-bull' : 'tone-bear'}`}>{formatR(trade.rMultiple)}</span>
                  <span className="trade-detail">
                    進 {formatUsd(trade.entryPrice)} · 出 {formatUsd(trade.exitPrice)} · {reasonLabel(trade.reason)} · {trade.barsHeld} 根
                  </span>
                </li>
              ))}
            </ol>
          )}

          <p className="chart-note">
            {source ? `4 小時 K 線來源 ${source}` : '沒有 4 小時 K 線來源'}
            {` · 已收盤 ${analysis.closedCount} 根`}
            {analysis.lastClosedTime != null ? ` · 最後一根開於 ${formatTaipei(analysis.lastClosedTime * 1000, false)}` : ''}
            {analysis.closedCount < 300 ? ' · 這次少於 300 根，重播看得到的歷史比較短。' : ''}
          </p>

          <details className="method">
            <summary>重播規則</summary>
            <p>
              通道高是前 40 根最高價，通道低是前 40 根最低價，都不含當根。ATR 用 14 期 Wilder：真實波幅取高減低、高與前收之差、低與前收之差的最大值；第一個 ATR 是前 14 個真實波幅的平均，之後是（前值 × 13 + 當根）/ 14。倍數是 3。
            </p>
            <p>
              空手時，收盤高於通道高就排定做多，低於通道低就排定做空，成交在下一根開盤。停損放在進場價減或加 3 倍訊號那根的 ATR。持倉後，多單追蹤進場以來的最高價、空單追蹤最低價，每根收盤把停損收到極值外側 3 倍 ATR，只往有利的方向移。多單最低價碰到停損，或空單最高價碰到停損，就以停損價出場；開盤已經穿過則以開盤價出場。多單若收在通道低之下，下一根開盤平多並反手做空；空單相反。沒有固定停利。
            </p>
            <p>
              每一根的順序是：先更新極值與停損並檢查反手，再在空手時檢查進場，最後用更新後的停損檢查這根的高低點。判斷只用已收盤的四小時 K 線。上一根排定的成交，若下一根已經開出，成交價用那根開盤，這根的高低和收盤不參與判斷。實盤濾網預設關閉；打開時只標示剛收盤的訊號，現價沿突破方向離開觸發價超過 0.5×ATR 就標成略過。濾網不改理論部位。
            </p>
          </details>
        </>
      )}
    </section>
  )
}

function filterCopy(filter: ReturnType<typeof liveFilter> | null, side: Side | null): string {
  if (!filter || filter.state === 'no-price') return '濾網開啟。還沒有現價，無法比較觸發價。'
  if (filter.state === 'no-fresh') {
    return `濾網開啟。剛收盤的這根四小時沒有新的突破。${side ? '較早的理論部位不會被當成一筆新的進場。' : '目前沒有要標示的新訊號。'}`
  }
  const way = filter.side === 'long' ? '做多' : '做空'
  const level = formatUsd(filter.trigger)
  const room = formatUsd(filter.allowance)
  if (filter.state === 'skip') {
    return `濾網開啟。剛收盤有${way}突破，觸發價 ${level}。現價沿突破方向離開觸發價已超過 0.5×ATR（${room}）。依照這個濾網，該筆會略過。理論部位本身不變。`
  }
  return `濾網開啟。剛收盤有${way}突破，觸發價 ${level}。現價還沒有沿突破方向離開超過 0.5×ATR（${room}）。這只是濾網的標示，不是進場指示。`
}
