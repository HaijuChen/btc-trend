import { TickMarkType, type Time } from 'lightweight-charts'
import type { IntervalId } from '../config.ts'

const TAIPEI = 'Asia/Taipei'

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatUsd(value: number, digits = 2): string {
  return `$${formatNumber(value, digits)}`
}

export function formatSigned(value: number, digits = 1): string {
  const body = formatNumber(Math.abs(value), digits)
  if (value > 0) return `+${body}`
  if (value < 0) return `−${body}`
  return formatNumber(0, digits)
}

export function formatSignedPct(value: number, digits = 2): string {
  return `${formatSigned(value, digits)}%`
}

export function formatWeight(fraction: number): string {
  const pct = fraction * 100
  const digits = Math.abs(pct - Math.round(pct)) < 0.05 ? 0 : 1
  return `${formatNumber(pct, digits)}%`
}

export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e12) return `${sign}$${formatNumber(abs / 1e12, 2)} 兆`
  if (abs >= 1e8) return `${sign}$${formatNumber(abs / 1e8, 2)} 億`
  if (abs >= 1e4) return `${sign}$${formatNumber(abs / 1e4, 1)} 萬`
  return `${sign}$${formatNumber(abs, 0)}`
}

export function formatBtcAmount(value: number): string {
  const digits = value >= 1000 ? 0 : 2
  return `${formatNumber(value, digits)} BTC`
}

export function formatTwd(value: number): string {
  return `NT$${formatNumber(value, 0)}`
}

export function formatFunding(rate: number): string {
  return formatSignedPct(rate * 100, 4)
}

export function formatTaipei(ms: number, withSeconds = true): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(new Date(ms))
}

export function formatTaipeiClock(ms: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}

export function formatTaipeiShort(ms: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}

export function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(ms))
}

export function formatCountdown(targetMs: number, now: number): string {
  const diff = targetMs - now
  if (diff <= 0) return '即將結算'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours <= 0) return `${minutes} 分後`
  return `${hours} 小時 ${minutes} 分後`
}

export function formatChartTime(time: Time, tickMarkType: TickMarkType, interval: IntervalId): string {
  if (typeof time !== 'number') return ''
  const date = new Date(time * 1000)
  if (tickMarkType === TickMarkType.Year) {
    return new Intl.DateTimeFormat('zh-TW', { timeZone: TAIPEI, year: 'numeric' }).format(date)
  }
  const intraday = interval === '15m' || interval === '1h' || interval === '4h'
  const withClock = intraday && (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds)
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    month: 'numeric',
    day: 'numeric',
    hour: withClock ? '2-digit' : undefined,
    minute: withClock ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(date)
}

export function formatCrosshairTime(time: Time, interval: IntervalId): string {
  if (typeof time !== 'number') return ''
  const intraday = interval === '15m' || interval === '1h' || interval === '4h'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: intraday ? '2-digit' : undefined,
    minute: intraday ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(new Date(time * 1000))
}
