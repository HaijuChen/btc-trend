import type { Candle } from '../types.ts'

/** BTC/USDT 4h Donchian breakout with a 3×ATR chandelier stop. Closed candles only. */

export const DONCHIAN_N = 40
export const ATR_PERIOD = 14
export const ATR_MULT = 3
export const CHASE_ATR = 0.5
export const FOUR_HOURS = 4 * 60 * 60

export type Side = 'long' | 'short'
export type ExitReason = 'stop' | 'reverse'
export type MarkerKind = 'entry' | 'stop' | 'reverse'

export type StrategyTrade = {
  side: Side
  entryTime: number
  entryPrice: number
  exitTime: number
  exitPrice: number
  reason: ExitReason
  atrAtEntry: number
  rMultiple: number
  barsHeld: number
}

export type StrategyMarker = {
  time: number
  kind: MarkerKind
  side: Side
}

export type StopLinePoint = {
  time: number
  /** Null is a break so two separate trades do not draw as one line. */
  value: number | null
}

export type StrategyEvent = {
  time: number
  kind: 'enter' | 'stop' | 'reverse'
  side: Side
  price: number
}

export type StopAudit = {
  index: number
  side: Side
  stop: number
  entryTime: number
}

export type StrategyPosition = {
  side: Side
  entryPrice: number
  entryTime: number
  stop: number
  ext: number
  atrAtEntry: number
  barsHeld: number
  signalTime: number
  /** Donchian level the signal candle closed through. */
  trigger: number
  /** True when the signal candle is the latest closed candle. */
  fresh: boolean
}

export type StrategyPending = {
  action: 'enter' | 'reverse'
  side: Side
  signalTime: number
  trigger: number
  atr: number
}

export type StrategyReplay = {
  hh: number | null
  ll: number | null
  atr: number | null
  lastClosedTime: number | null
  position: StrategyPosition | null
  pending: StrategyPending | null
  trades: StrategyTrade[]
  markers: StrategyMarker[]
  stopLine: StopLinePoint[]
  events: StrategyEvent[]
  audits: StopAudit[]
}

export type StrategyAnalysis = StrategyReplay & {
  closedCount: number
  forming: Candle | null
  /** A fill scheduled by the last close was applied at the forming candle's open. */
  filledOnForming: boolean
  /** The unfinished candle has already traded through the active stop. The position is unchanged until it closes. */
  formingTouchedStop: boolean
}

export type LiveFilter =
  | { state: 'no-price' }
  | { state: 'no-fresh'; side: Side | null }
  | {
      state: 'inside' | 'skip'
      side: Side
      trigger: number
      atr: number
      overshoot: number
      allowance: number
    }

type OpenPos = {
  side: Side
  entryPrice: number
  entryTime: number
  entryIndex: number
  signalTime: number
  signalIndex: number
  trigger: number
  atrAtEntry: number
  stop: number
  ext: number
}

type Pend = {
  action: 'enter' | 'reverse'
  side: Side
  signalIndex: number
  signalTime: number
  trigger: number
  atr: number
}

function finiteCandle(candle: Candle): boolean {
  return [candle.time, candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
}

function prepare(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const candle of candles) {
    if (!finiteCandle(candle)) continue
    byTime.set(candle.time, candle)
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

export function wilderAtr(candles: Candle[], period = ATR_PERIOD): Array<number | null> {
  const out: Array<number | null> = candles.map(() => null)
  if (period < 1 || candles.length <= period) return out
  const tr: number[] = []
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i]
    const prevClose = candles[i - 1].close
    tr.push(Math.max(current.high - current.low, Math.abs(current.high - prevClose), Math.abs(current.low - prevClose)))
  }
  let sum = 0
  for (let i = 0; i < period; i += 1) sum += tr[i]
  let prev = sum / period
  out[period] = prev
  for (let i = period; i < tr.length; i += 1) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i + 1] = prev
  }
  return out
}

export function donchian(candles: Candle[], n = DONCHIAN_N): { hh: Array<number | null>; ll: Array<number | null> } {
  const hh: Array<number | null> = candles.map(() => null)
  const ll: Array<number | null> = candles.map(() => null)
  for (let i = n; i < candles.length; i += 1) {
    let high = -Infinity
    let low = Infinity
    for (let j = i - n; j < i; j += 1) {
      if (candles[j].high > high) high = candles[j].high
      if (candles[j].low < low) low = candles[j].low
    }
    hh[i] = high
    ll[i] = low
  }
  return { hh, ll }
}

function initialStop(side: Side, entry: number, atr: number): number {
  const risk = ATR_MULT * atr
  return side === 'long' ? entry - risk : entry + risk
}

function rMultiple(side: Side, entry: number, exit: number, atr: number): number {
  const risk = ATR_MULT * atr
  if (!(risk > 0)) return 0
  const points = side === 'long' ? exit - entry : entry - exit
  return points / risk
}

function barsBetween(entryIndex: number, exitIndex: number, reason: ExitReason): number {
  if (reason === 'reverse') return Math.max(1, exitIndex - entryIndex)
  return exitIndex - entryIndex + 1
}

/** Long exits at the stop, or at the open when the bar gaps through. Short is mirrored. */
function stopFill(side: Side, stop: number, candle: Candle): number | null {
  if (side === 'long') {
    if (candle.low > stop) return null
    return candle.open <= stop ? candle.open : stop
  }
  if (candle.high < stop) return null
  return candle.open >= stop ? candle.open : stop
}

function toTrade(pos: OpenPos, exitPrice: number, exitTime: number, exitIndex: number, reason: ExitReason): StrategyTrade {
  return {
    side: pos.side,
    entryTime: pos.entryTime,
    entryPrice: pos.entryPrice,
    exitTime,
    exitPrice,
    reason,
    atrAtEntry: pos.atrAtEntry,
    rMultiple: rMultiple(pos.side, pos.entryPrice, exitPrice, pos.atrAtEntry),
    barsHeld: barsBetween(pos.entryIndex, exitIndex, reason),
  }
}

function openAt(fill: number, index: number, time: number, pending: Pend): OpenPos {
  return {
    side: pending.side,
    entryPrice: fill,
    entryTime: time,
    entryIndex: index,
    signalTime: pending.signalTime,
    signalIndex: pending.signalIndex,
    trigger: pending.trigger,
    atrAtEntry: pending.atr,
    stop: initialStop(pending.side, fill, pending.atr),
    ext: fill,
  }
}

/**
 * Replay closed candles in order.
 * On each candle: fill a pending order at the open, update the extreme and stop, check a reverse
 * breakout, check a fresh entry only when flat, then see if this bar's range hit the updated stop.
 * The stop moves only in the favorable direction.
 */
export function replayClosed(input: Candle[]): StrategyReplay {
  const candles = prepare(input)
  const atr = wilderAtr(candles)
  const channel = donchian(candles)
  const trades: StrategyTrade[] = []
  const markers: StrategyMarker[] = []
  const events: StrategyEvent[] = []
  const audits: StopAudit[] = []
  const stopLine: StopLinePoint[] = []
  let pos: OpenPos | null = null
  let pending: Pend | null = null
  let segmentSide: Side | null = null
  let breakNext = false

  const pushStop = (time: number, value: number, side: Side) => {
    const prev = stopLine[stopLine.length - 1]
    const sideChanged = segmentSide != null && segmentSide !== side
    const gapped = prev != null && prev.value != null && time - prev.time > FOUR_HOURS
    if ((breakNext || sideChanged || gapped) && prev != null && prev.value != null && prev.time + 1 < time) {
      stopLine.push({ time: prev.time + 1, value: null })
    }
    breakNext = false
    if (prev != null && prev.time === time) prev.value = value
    else stopLine.push({ time, value })
    segmentSide = side
  }

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i]
    if (pending) {
      const opening = pending
      if (opening.action === 'reverse' && pos) {
        trades.push(toTrade(pos, candle.open, candle.time, i, 'reverse'))
        pos = null
      }
      if (!pos) {
        pos = openAt(candle.open, i, candle.time, opening)
        const kind = opening.action === 'reverse' ? 'reverse' : 'entry'
        markers.push({ time: candle.time, kind, side: opening.side })
        events.push({ time: candle.time, kind: opening.action === 'reverse' ? 'reverse' : 'enter', side: opening.side, price: candle.open })
      }
      pending = null
    }

    const barAtr = atr[i]
    const hh = channel.hh[i]
    const ll = channel.ll[i]
    if (pos && barAtr != null) {
      if (pos.side === 'long') {
        pos.ext = Math.max(pos.ext, candle.high)
        pos.stop = Math.max(pos.stop, pos.ext - ATR_MULT * barAtr)
        if (ll != null && candle.close < ll) {
          pending = { action: 'reverse', side: 'short', signalIndex: i, signalTime: candle.time, trigger: ll, atr: barAtr }
        }
      } else {
        pos.ext = Math.min(pos.ext, candle.low)
        pos.stop = Math.min(pos.stop, pos.ext + ATR_MULT * barAtr)
        if (hh != null && candle.close > hh) {
          pending = { action: 'reverse', side: 'long', signalIndex: i, signalTime: candle.time, trigger: hh, atr: barAtr }
        }
      }
    }

    if (!pos && !pending && hh != null && ll != null && barAtr != null) {
      if (candle.close > hh) {
        pending = { action: 'enter', side: 'long', signalIndex: i, signalTime: candle.time, trigger: hh, atr: barAtr }
      } else if (candle.close < ll) {
        pending = { action: 'enter', side: 'short', signalIndex: i, signalTime: candle.time, trigger: ll, atr: barAtr }
      }
    }

    if (pos) {
      audits.push({ index: i, side: pos.side, stop: pos.stop, entryTime: pos.entryTime })
      const exitPrice = stopFill(pos.side, pos.stop, candle)
      if (exitPrice != null) {
        const side = pos.side
        pushStop(candle.time, pos.stop, side)
        trades.push(toTrade(pos, exitPrice, candle.time, i, 'stop'))
        markers.push({ time: candle.time, kind: 'stop', side })
        events.push({ time: candle.time, kind: 'stop', side, price: exitPrice })
        pos = null
        segmentSide = null
        breakNext = true
      } else {
        pushStop(candle.time, pos.stop, pos.side)
      }
    }
  }

  const last = candles.length - 1
  const position: StrategyPosition | null = pos
    ? {
        side: pos.side,
        entryPrice: pos.entryPrice,
        entryTime: pos.entryTime,
        stop: pos.stop,
        ext: pos.ext,
        atrAtEntry: pos.atrAtEntry,
        barsHeld: last - pos.entryIndex + 1,
        signalTime: pos.signalTime,
        trigger: pos.trigger,
        fresh: pos.signalIndex === last,
      }
    : null

  return {
    hh: last >= 0 ? channel.hh[last] : null,
    ll: last >= 0 ? channel.ll[last] : null,
    atr: last >= 0 ? atr[last] : null,
    lastClosedTime: last >= 0 ? candles[last].time : null,
    position,
    pending: pending
      ? { action: pending.action, side: pending.side, signalTime: pending.signalTime, trigger: pending.trigger, atr: pending.atr }
      : null,
    trades,
    markers,
    stopLine,
    events,
    audits,
  }
}

export function splitClosed(candles: Candle[], nowSec: number): { closed: Candle[]; forming: Candle | null } {
  const rows = prepare(candles)
  const now = nowSec > 1e12 ? nowSec / 1000 : nowSec
  if (rows.length === 0) return { closed: [], forming: null }
  const last = rows[rows.length - 1]
  if (now < last.time + FOUR_HOURS) return { closed: rows.slice(0, -1), forming: last }
  return { closed: rows, forming: null }
}

function touchedStop(side: Side, stop: number, candle: Candle): boolean {
  return side === 'long' ? candle.low <= stop : candle.high >= stop
}

function extendStop(line: StopLinePoint[], time: number, value: number, sideChanged: boolean): StopLinePoint[] {
  const next = line.slice()
  const prev = [...next].reverse().find((point) => point.value != null)
  if (prev && (sideChanged || time - prev.time > FOUR_HOURS) && prev.time + 1 < time) {
    next.push({ time: prev.time + 1, value: null })
  }
  if (next.length > 0 && next[next.length - 1].time === time) next[next.length - 1].value = value
  else next.push({ time, value })
  return next
}

/**
 * Replay closed 4h candles. If the previous close scheduled a fill, use the forming candle's
 * open as that fill. Its high, low, and close do not move the stop or create a signal.
 */
export function analyzeStrategy(candles: Candle[], nowSec: number): StrategyAnalysis {
  const { closed, forming } = splitClosed(candles, nowSec)
  const replay = replayClosed(closed)
  const base: StrategyAnalysis = {
    ...replay,
    closedCount: closed.length,
    forming,
    filledOnForming: false,
    formingTouchedStop: false,
  }
  if (!forming) return base

  if (!replay.pending) {
    if (replay.position) {
      return {
        ...base,
        stopLine: extendStop(replay.stopLine, forming.time, replay.position.stop, false),
        formingTouchedStop: touchedStop(replay.position.side, replay.position.stop, forming),
      }
    }
    return base
  }

  const pending = replay.pending
  let position = replay.position
  const trades = replay.trades.slice()
  const markers = replay.markers.slice()
  const events = replay.events.slice()
  let stopLine = replay.stopLine.slice()
  let filledOnForming = false

  if (pending.action === 'reverse' && position) {
    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime: forming.time,
      exitPrice: forming.open,
      reason: 'reverse',
      atrAtEntry: position.atrAtEntry,
      rMultiple: rMultiple(position.side, position.entryPrice, forming.open, position.atrAtEntry),
      barsHeld: Math.max(1, position.barsHeld),
    })
    position = null
  }

  if (!position) {
    position = {
      side: pending.side,
      entryPrice: forming.open,
      entryTime: forming.time,
      stop: initialStop(pending.side, forming.open, pending.atr),
      ext: forming.open,
      atrAtEntry: pending.atr,
      barsHeld: 0,
      signalTime: pending.signalTime,
      trigger: pending.trigger,
      fresh: pending.signalTime === replay.lastClosedTime,
    }
    markers.push({ time: forming.time, kind: pending.action === 'reverse' ? 'reverse' : 'entry', side: pending.side })
    events.push({
      time: forming.time,
      kind: pending.action === 'reverse' ? 'reverse' : 'enter',
      side: pending.side,
      price: forming.open,
    })
    stopLine = extendStop(stopLine, forming.time, position.stop, true)
    filledOnForming = true
  }

  return {
    ...base,
    position,
    pending: null,
    trades,
    markers,
    events,
    stopLine,
    filledOnForming,
    formingTouchedStop: position ? touchedStop(position.side, position.stop, forming) : false,
  }
}

export function positionMove(position: StrategyPosition, price: number): { rMultiple: number; percent: number; stopPercent: number } | null {
  if (!Number.isFinite(price) || price <= 0 || position.entryPrice <= 0) return null
  const risk = ATR_MULT * position.atrAtEntry
  const points = position.side === 'long' ? price - position.entryPrice : position.entryPrice - price
  const stopDistance = position.side === 'long' ? price - position.stop : position.stop - price
  return {
    rMultiple: risk > 0 ? points / risk : 0,
    percent: (points / position.entryPrice) * 100,
    stopPercent: (stopDistance / price) * 100,
  }
}

/** Informational live filter. It does not change the replay. */
export function liveFilter(analysis: Pick<StrategyAnalysis, 'position' | 'pending' | 'lastClosedTime'>, price: number | null): LiveFilter {
  if (price == null || !Number.isFinite(price)) return { state: 'no-price' }
  const pending = analysis.pending
  const position = analysis.position
  const freshPending = pending != null && pending.signalTime === analysis.lastClosedTime
  const signal = freshPending
    ? { side: pending.side, trigger: pending.trigger, atr: pending.atr }
    : position?.fresh
      ? { side: position.side, trigger: position.trigger, atr: position.atrAtEntry }
      : null
  if (!signal || !(signal.atr > 0) || !Number.isFinite(signal.trigger)) {
    return { state: 'no-fresh', side: position?.side ?? pending?.side ?? null }
  }
  const allowance = CHASE_ATR * signal.atr
  const overshoot = signal.side === 'long' ? price - signal.trigger : signal.trigger - price
  return {
    state: overshoot > allowance ? 'skip' : 'inside',
    side: signal.side,
    trigger: signal.trigger,
    atr: signal.atr,
    overshoot,
    allowance,
  }
}
