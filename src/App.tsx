import { useEffect, useMemo, useState } from 'react'
import { Breakdown } from './components/Breakdown.tsx'
import { CandleChart } from './components/CandleChart.tsx'
import { ContextGrid } from './components/ContextGrid.tsx'
import { Levels } from './components/Levels.tsx'
import { MarketStrip, PriceBar } from './components/PriceBar.tsx'
import { StrategyPanel } from './components/StrategyPanel.tsx'
import { Verdict } from './components/Verdict.tsx'
import type { IntervalId, ScoreIntervalId } from './config.ts'
import { useMarket } from './hooks/useMarket.ts'
import { formatSignedPct, formatUsd } from './lib/format.ts'
import { labelFor } from './lib/score.ts'
import { analyzeStrategy, type StopLinePoint, type StrategyMarker } from './lib/strategy.ts'
import { buildSummary } from './lib/summary.ts'

const NO_MARKERS: StrategyMarker[] = []
const NO_STOPS: StopLinePoint[] = []

export default function App() {
  const { state, reload } = useMarket()
  const [chartInterval, setChartInterval] = useState<IntervalId>('1d')
  const [activeFrame, setActiveFrame] = useState<ScoreIntervalId>('1w')
  const [showStrategy, setShowStrategy] = useState(false)

  useEffect(() => {
    const ticker = state.ticker
    if (!ticker) {
      document.title = 'BTC 多空判讀'
      return
    }
    document.title = `${formatUsd(ticker.price, 0)} ${formatSignedPct(ticker.changePercent)} · BTC 多空判讀`
  }, [state.ticker])

  const summary = useMemo(() => {
    if (!state.score) return null
    return buildSummary({
      composite: state.score,
      fear: state.fearGreed ? { value: state.fearGreed.value, label: state.fearGreed.label } : null,
      fundingRate: state.funding?.rate ?? null,
      longPct: state.longShort?.longPct ?? null,
      longShortSource: state.longShort?.source ?? null,
    })
  }, [state.score, state.fearGreed, state.funding, state.longShort])

  const verdict = state.score ? labelFor(state.score.signal, 'composite') : null
  const strategy = useMemo(() => {
    const candles = state.candles['4h']
    if (!candles || candles.length === 0 || state.updatedAt == null) return null
    return analyzeStrategy(candles, state.updatedAt / 1000)
  }, [state.candles, state.updatedAt])

  const selectFrame = (id: ScoreIntervalId) => {
    setActiveFrame(id)
    document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const toggleStrategy = () => {
    if (chartInterval !== '4h') {
      setChartInterval('4h')
      setShowStrategy(true)
      return
    }
    setShowStrategy((value) => !value)
  }

  return (
    <div className="shell">
      <PriceBar ticker={state.ticker} verdict={verdict} signal={state.score?.signal ?? null} refreshing={state.refreshing} onRefresh={() => void reload()} />
      <main className="wrap">
        {state.status === 'loading' ? <Loading /> : null}
        {state.status === 'error' ? <ErrorState message={state.error ?? '讀取失敗'} onRetry={() => void reload()} /> : null}
        {state.status === 'ready' && state.ticker ? (
          <>
            {state.staleMessage ? <p className="banner">{state.staleMessage}</p> : null}
            <MarketStrip
              ticker={state.ticker}
              twd={state.twd}
              updatedAt={state.updatedAt}
              refreshing={state.refreshing}
              priceLive={state.priceLive}
            />
            <Verdict score={state.score} summary={summary} onSelectFrame={selectFrame} />
            <StrategyPanel
              analysis={strategy}
              source={state.candleSources['4h'] ?? null}
              error={state.candleErrors['4h'] ?? null}
              price={state.ticker.price}
            />
            <CandleChart
              interval={chartInterval}
              onInterval={setChartInterval}
              candles={state.candles[chartInterval] ?? null}
              error={state.candleErrors[chartInterval] ?? null}
              source={state.candleSources[chartInterval] ?? null}
              livePrice={state.ticker.price}
              updatedAt={state.updatedAt}
              showStrategy={showStrategy}
              onToggleStrategy={toggleStrategy}
              strategyMarkers={strategy?.markers ?? NO_MARKERS}
              strategyStops={strategy?.stopLine ?? NO_STOPS}
            />
            <Breakdown score={state.score} active={activeFrame} onActive={setActiveFrame} />
            <ContextGrid
              fear={state.fearGreed}
              fearError={state.fearError}
              funding={state.funding}
              fundingError={state.fundingError}
              openInterest={state.openInterest}
              oiError={state.oiError}
              longShort={state.longShort}
              lsError={state.lsError}
              global={state.global}
              globalError={state.globalError}
            />
            <Levels levels={state.levels} price={state.ticker.price} />
          </>
        ) : null}
      </main>
      <footer className="wrap disclaimer">
        <h2>免責聲明</h2>
        <p>
          本頁把公開行情換算成技術指標與加權分數，只供學習與市場觀察。它不是投資建議，也不是買賣比特幣或任何加密資產的邀約。指標會落後、會失真，過去的價格形態不代表未來。加密資產波動很大，可能在短時間內大幅上漲或下跌。請自行研究，並為自己的決定負責。
        </p>
        <p>
          「長線策略參考訊號」是四小時唐奇安突破加 ATR 移動停損的理論重播，不是實際委託，也不是投資建議。這套策略的樣本外測試是 −1.2R。來源機器人目前只管理已經有的部位，不會新開比特幣倉位。
        </p>
        <p className="fine">
          現貨報價與 K 線預設讀幣安公開行情，失敗時改接 OKX、Gate.io，再不行則用 CoinGecko。永續資金費率、未平倉與多空比預設讀幣安合約，失敗時改接 OKX、Bitget 或 Gate.io。恐懼與貪婪指數來自 Alternative.me，總市值與比特幣占比來自 CoinGecko。圖表由{' '}
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">
            TradingView Lightweight Charts
          </a>{' '}
          繪製。
        </p>
      </footer>
    </div>
  )
}

function Loading() {
  return (
    <section className="card loading" aria-busy="true" aria-live="polite">
      <p className="eyebrow">正在讀取</p>
      <h2>連上公開行情，計算均線、MACD、RSI 與 ADX。</h2>
      <div className="skel skel-lg" />
      <div className="skel-row">
        <div className="skel" />
        <div className="skel" />
        <div className="skel" />
      </div>
    </section>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="card error-card" role="alert">
      <p className="eyebrow">連線不順</p>
      <h2>{message}</h2>
      <p>手機網路或交易所的地區限制都可能造成這件事。稍等一下再重整即可。</p>
      <button type="button" className="refresh" onClick={onRetry}>
        再試一次
      </button>
    </section>
  )
}
