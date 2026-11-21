import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type TickMarkType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { CHART_INTERVALS, INTERVAL_LABEL, INTERVAL_SECONDS, type IntervalId } from '../config.ts'
import { formatChartTime, formatCrosshairTime } from '../lib/format.ts'
import { ema } from '../lib/math.ts'
import type { StopLinePoint, StrategyMarker } from '../lib/strategy.ts'
import type { Candle } from '../types.ts'

const DEFAULT_BARS: Record<IntervalId, number> = {
  '15m': 96,
  '1h': 120,
  '4h': 150,
  '1d': 180,
  '1w': 160,
}

const EMA_COLORS = {
  20: '#f2d48a',
  50: '#7eb0d6',
  200: '#f4f0e6',
} as const

type ChartBundle = {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  ema20: ISeriesApi<'Line'>
  ema50: ISeriesApi<'Line'>
  ema200: ISeriesApi<'Line'>
  stop: ISeriesApi<'Line'>
  markers: ISeriesMarkersPluginApi<Time>
}

function toMarkers(items: StrategyMarker[]): SeriesMarker<Time>[] {
  return items
    .map((item): SeriesMarker<Time> => {
      const time = item.time as UTCTimestamp
      if (item.kind === 'entry' && item.side === 'long') {
        return { time, position: 'belowBar', shape: 'arrowUp', color: '#8fd0a8', text: '多' }
      }
      if (item.kind === 'entry' && item.side === 'short') {
        return { time, position: 'aboveBar', shape: 'arrowDown', color: '#ef8b78', text: '空' }
      }
      if (item.kind === 'stop') {
        return item.side === 'long'
          ? { time, position: 'aboveBar', shape: 'arrowDown', color: '#e0b15a', text: '停損' }
          : { time, position: 'belowBar', shape: 'arrowUp', color: '#e0b15a', text: '停損' }
      }
      return item.side === 'long'
        ? { time, position: 'belowBar', shape: 'arrowUp', color: '#e0b15a', text: '反多' }
        : { time, position: 'aboveBar', shape: 'arrowDown', color: '#e0b15a', text: '反空' }
    })
    .sort((a, b) => Number(a.time) - Number(b.time))
}

function toStopData(points: StopLinePoint[]) {
  const sorted = points.slice().sort((a, b) => a.time - b.time)
  const data: Array<{ time: UTCTimestamp; value?: number }> = []
  let last = -Infinity
  for (const point of sorted) {
    if (point.time <= last) continue
    last = point.time
    data.push(point.value == null ? { time: point.time as UTCTimestamp } : { time: point.time as UTCTimestamp, value: point.value })
  }
  return data
}

function toCandleData(candles: Candle[]) {
  return candles.map((candle) => ({
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }))
}

function toLineData(candles: Candle[], values: Array<number | null>) {
  const data: Array<{ time: UTCTimestamp; value: number }> = []
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) return
    const candle = candles[index]
    if (!candle) return
    data.push({ time: candle.time as UTCTimestamp, value })
  })
  return data
}

function liveCandle(last: Candle, price: number, interval: IntervalId): Candle | null {
  if (!Number.isFinite(price)) return null
  const now = Date.now() / 1000
  const duration = INTERVAL_SECONDS[interval]
  if (now < last.time) return null
  if (now < last.time + duration) {
    return {
      ...last,
      close: price,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
    }
  }
  const steps = Math.floor((now - last.time) / duration)
  const time = last.time + steps * duration
  return { time, open: price, high: price, low: price, close: price, volume: 0 }
}

export function CandleChart({
  interval,
  onInterval,
  candles,
  error,
  source,
  livePrice,
  updatedAt,
  showStrategy,
  onToggleStrategy,
  strategyMarkers,
  strategyStops,
}: {
  interval: IntervalId
  onInterval: (interval: IntervalId) => void
  candles: Candle[] | null
  error: string | null
  source: string | null
  livePrice: number | null
  updatedAt: number | null
  showStrategy: boolean
  onToggleStrategy: () => void
  strategyMarkers: StrategyMarker[]
  strategyStops: StopLinePoint[]
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const bundleRef = useRef<ChartBundle | null>(null)
  const intervalRef = useRef(interval)
  const seenInterval = useRef<IntervalId | null>(null)
  const countRef = useRef(0)
  const [show20, setShow20] = useState(true)
  const [show50, setShow50] = useState(true)
  const [show200, setShow200] = useState(true)

  useEffect(() => {
    intervalRef.current = interval
  }, [interval])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#b7b1a3',
        fontFamily: '"IBM Plex Mono", "Noto Sans TC", sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(244, 240, 230, 0.05)' },
        horzLines: { color: 'rgba(244, 240, 230, 0.05)' },
      },
      rightPriceScale: { borderColor: 'rgba(244, 240, 230, 0.12)' },
      timeScale: {
        borderColor: 'rgba(244, 240, 230, 0.12)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) =>
          formatChartTime(time, tickMarkType, intervalRef.current),
      },
      localization: {
        locale: 'zh-TW',
        timeFormatter: (time: Time) => formatCrosshairTime(time, intervalRef.current),
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(244, 240, 230, 0.28)', labelBackgroundColor: '#2a2c24' },
        horzLine: { color: 'rgba(244, 240, 230, 0.28)', labelBackgroundColor: '#2a2c24' },
      },
      handleScroll: { vertTouchDrag: false },
    })
    const priceFormat = { type: 'price' as const, precision: 2, minMove: 0.01 }
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#8fd0a8',
      downColor: '#ef8b78',
      wickUpColor: '#8fd0a8',
      wickDownColor: '#ef8b78',
      borderVisible: false,
      priceFormat,
    })
    const lineOptions = {
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      priceFormat,
    }
    const ema20 = chart.addSeries(LineSeries, { ...lineOptions, color: EMA_COLORS[20], lineWidth: 2, title: 'EMA20' })
    const ema50 = chart.addSeries(LineSeries, { ...lineOptions, color: EMA_COLORS[50], lineWidth: 2, title: 'EMA50' })
    const ema200 = chart.addSeries(LineSeries, { ...lineOptions, color: EMA_COLORS[200], lineWidth: 2, title: 'EMA200' })
    const stop = chart.addSeries(LineSeries, {
      ...lineOptions,
      color: '#e0b15a',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: '停損',
      visible: false,
      lastValueVisible: true,
    })
    const markers = createSeriesMarkers(candleSeries, [])
    bundleRef.current = { chart, candles: candleSeries, ema20, ema50, ema200, stop, markers }
    return () => {
      bundleRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle || !candles || candles.length === 0) return
    const closes = candles.map((candle) => candle.close)
    const intervalChanged = seenInterval.current !== interval
    seenInterval.current = interval
    const logical = bundle.chart.timeScale().getVisibleLogicalRange()
    const previousCount = countRef.current
    bundle.chart.applyOptions({
      timeScale: { timeVisible: interval !== '1d' && interval !== '1w', secondsVisible: false },
    })
    bundle.candles.setData(toCandleData(candles))
    bundle.ema20.setData(toLineData(candles, ema(closes, 20)))
    bundle.ema50.setData(toLineData(candles, ema(closes, 50)))
    bundle.ema200.setData(toLineData(candles, ema(closes, 200)))
    bundle.ema20.applyOptions({ visible: show20 })
    bundle.ema50.applyOptions({ visible: show50 })
    bundle.ema200.applyOptions({ visible: show200 })
    const count = candles.length
    const atRealtime = intervalChanged || !logical || previousCount === 0 || logical.to >= previousCount - 1.5
    if (atRealtime) {
      const bars = DEFAULT_BARS[interval]
      bundle.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - bars), to: count + 3 })
    } else if (logical) {
      bundle.chart.timeScale().setVisibleLogicalRange(logical)
    }
    countRef.current = count
  }, [candles, interval, show20, show50, show200])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle) return
    if (!showStrategy || interval !== '4h') {
      bundle.markers.setMarkers([])
      bundle.stop.setData([])
      bundle.stop.applyOptions({ visible: false })
      return
    }
    bundle.stop.applyOptions({ visible: true })
    bundle.stop.setData(toStopData(strategyStops))
    bundle.markers.setMarkers(toMarkers(strategyMarkers))
  }, [showStrategy, interval, strategyMarkers, strategyStops])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle || !candles || candles.length === 0 || livePrice == null) return
    const next = liveCandle(candles[candles.length - 1], livePrice, interval)
    if (!next) return
    bundle.candles.update({
      time: next.time as UTCTimestamp,
      open: next.open,
      high: next.high,
      low: next.low,
      close: next.close,
    })
  }, [candles, interval, livePrice])

  const scored = interval === '4h' || interval === '1d' || interval === '1w'
  const lastCandle = candles != null && candles.length > 0 ? candles[candles.length - 1] : null
  const forming = updatedAt != null && lastCandle != null && updatedAt / 1000 < lastCandle.time + INTERVAL_SECONDS[interval]

  return (
    <section className="card chart-card" id="chart" aria-label="比特幣 K 線">
      <div className="section-head">
        <div>
          <p className="eyebrow">K 線</p>
          <h2>BTC / USDT</h2>
        </div>
        <div className="segment" role="tablist" aria-label="圖表週期">
          {CHART_INTERVALS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === interval}
              className={id === interval ? 'is-on' : ''}
              onClick={() => onInterval(id)}
            >
              {INTERVAL_LABEL[id]}
            </button>
          ))}
        </div>
      </div>
      <div className="legend">
        <Toggle on={show20} color={EMA_COLORS[20]} label="EMA 20" onClick={() => setShow20((value) => !value)} />
        <Toggle on={show50} color={EMA_COLORS[50]} label="EMA 50" onClick={() => setShow50((value) => !value)} />
        <Toggle on={show200} color={EMA_COLORS[200]} label="EMA 200" onClick={() => setShow200((value) => !value)} />
        <Toggle on={showStrategy && interval === '4h'} color="#e0b15a" label="策略標記" onClick={onToggleStrategy} />
      </div>
      <div className="chart-frame">
        <div ref={hostRef} className="chart-canvas" />
        {candles == null ? <p className="chart-empty">{error ?? '這段 K 線還在讀取。'}</p> : null}
      </div>
      <p className="chart-note">
        {source ? `K 線來源 ${source}` : '沒有 K 線來源'}
        {forming ? ' · 這根 K 線還沒收完' : ''}
        {scored ? '' : ' · 這個週期只供看盤，不計入總分'}
        {showStrategy && interval === '4h' ? ' · 箭頭與虛線是理論重播，不是委託' : ''}
        {' · '}
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts
        </a>
      </p>
    </section>
  )
}

function Toggle({ on, color, label, onClick }: { on: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className={on ? 'legend-btn is-on' : 'legend-btn'} aria-pressed={on} onClick={onClick}>
      <i style={{ background: color }} />
      {label}
    </button>
  )
}
