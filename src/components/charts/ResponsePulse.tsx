'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AutoscaleInfo, IChartApi, ISeriesApi, ISeriesMarkersPluginApi, Time } from 'lightweight-charts'

export interface PulsePoint {
  day: string
  sent: number
  reached: number
  views: number
  responses: number
  meetings: number
}

type Mode = 'total' | 'daily' | 'rate'

interface Row extends PulsePoint {
  totalResponses: number
  totalReached: number
  rate: number | null
}

interface Palette {
  ink: string
  mute: string
  line: string
  surface: string
  chart: string
  font: string
}

interface Handles {
  chart: IChartApi
  area: ISeriesApi<'Area'>
  sends: ISeriesApi<'Histogram'>
  markers: ISeriesMarkersPluginApi<Time>
  applyPalette: () => void
}

const ranges = [14, 30, 90] as const
const modes: Array<{ key: Mode; label: string }> = [
  { key: 'total', label: 'Toplam yanıt' },
  { key: 'daily', label: 'Günlük' },
  { key: 'rate', label: 'Yanıt oranı' },
]

const tickFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' })

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    ink: get('--color-ink', '#111111'),
    mute: get('--color-mute', '#6b6b6b'),
    line: get('--color-line', '#e6e6e6'),
    surface: get('--color-surface', '#ffffff'),
    chart: get('--color-chart', '#7b81ee'),
    font: getComputedStyle(document.body).fontFamily || 'Sora, ui-sans-serif, system-ui, sans-serif',
  }
}

function alpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const value = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(value)) return hex
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`
}

function toDate(time: Time): Date {
  if (typeof time === 'string') return new Date(`${time}T00:00:00Z`)
  if (typeof time === 'number') return new Date(time * 1000)
  return new Date(Date.UTC(time.year, time.month - 1, time.day))
}

function dayKey(time: Time): string {
  return toDate(time).toISOString().slice(0, 10)
}

function percent(value: number): string {
  return `%${value.toLocaleString('tr-TR', { maximumFractionDigits: value < 10 ? 1 : 0 })}`
}

const countFormat = { type: 'custom' as const, minMove: 1, formatter: (price: number) => Math.round(price).toLocaleString('tr-TR') }
const rateFormat = { type: 'custom' as const, minMove: 0.1, formatter: (price: number) => percent(price) }

function meetingMarkers(rows: Row[], color: string) {
  return rows.filter((row) => row.meetings > 0).map((row) => ({ time: row.day, position: 'aboveBar' as const, shape: 'circle' as const, color, size: 0.7 }))
}

function valueFor(row: Row, mode: Mode): number | null {
  if (mode === 'daily') return row.responses
  if (mode === 'rate') return row.rate
  return row.totalResponses
}

export function ResponsePulse({ days, live }: { days: PulsePoint[]; live: boolean }) {
  const [range, setRange] = useState<(typeof ranges)[number]>(30)
  const [mode, setMode] = useState<Mode>('total')
  const [hover, setHover] = useState<Row | null>(null)
  const [ready, setReady] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const handles = useRef<Handles | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const rowsRef = useRef<Row[]>([])

  const rows = useMemo<Row[]>(() => {
    let totalResponses = 0
    let totalReached = 0
    for (const day of days.slice(0, Math.max(0, days.length - range))) {
      totalResponses += day.responses
      totalReached += day.reached
    }
    return days.slice(-range).map((day) => {
      totalResponses += day.responses
      totalReached += day.reached
      return { ...day, totalResponses, totalReached, rate: totalReached > 0 ? Math.min(100, (totalResponses / totalReached) * 100) : null }
    })
  }, [days, range])
  rowsRef.current = rows

  const summary = useMemo(() => rows.reduce((acc, row) => ({ sent: acc.sent + row.sent, views: acc.views + row.views, responses: acc.responses + row.responses, meetings: acc.meetings + row.meetings }), { sent: 0, views: 0, responses: 0, meetings: 0 }), [rows])
  const empty = summary.sent === 0 && summary.responses === 0 && summary.views === 0
  const last = rows[rows.length - 1]

  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | null = null
    let chart: IChartApi | null = null
    import('lightweight-charts').then((lib) => {
      if (disposed || !container.current) return
      const palette = readPalette()
      chart = lib.createChart(container.current, {
        autoSize: true,
        height: 240,
        layout: { background: { type: lib.ColorType.Solid, color: 'transparent' }, textColor: palette.mute, fontFamily: palette.font, fontSize: 11, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: alpha(palette.line, 0.9), style: lib.LineStyle.Solid } },
        crosshair: {
          mode: lib.CrosshairMode.Magnet,
          vertLine: { color: alpha(palette.mute, 0.6), width: 1, style: lib.LineStyle.Dashed, labelBackgroundColor: palette.ink },
          horzLine: { color: alpha(palette.mute, 0.6), width: 1, style: lib.LineStyle.Dashed, labelBackgroundColor: palette.ink },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.06 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: (time: Time) => tickFormat.format(toDate(time)) },
        localization: {
          locale: 'tr-TR',
          timeFormatter: (time: Time) => longFormat.format(toDate(time)),
        },
        handleScroll: false,
        handleScale: false,
      })
      const sends = chart.addSeries(lib.HistogramSeries, { priceScaleId: 'sends', color: alpha(palette.chart, 0.25), priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
      chart.priceScale('sends').applyOptions({ scaleMargins: { top: 0.7, bottom: 0 }, visible: false })
      const area = chart.addSeries(lib.AreaSeries, {
        lineColor: palette.chart,
        topColor: alpha(palette.chart, 0.32),
        bottomColor: alpha(palette.chart, 0.02),
        lineWidth: 2,
        lineType: lib.LineType.Curved,
        priceLineVisible: false,
        priceFormat: countFormat,
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
          const info = original()
          if (!info) return info
          const ceiling = modeRef.current === 'rate' ? 5 : 4
          return { ...info, priceRange: { minValue: 0, maxValue: Math.max(ceiling, info.priceRange ? info.priceRange.maxValue * 1.15 : ceiling) } }
        },
        crosshairMarkerBackgroundColor: palette.chart,
        crosshairMarkerBorderColor: palette.surface,
      })
      const markers = lib.createSeriesMarkers(area, [])
      const applyPalette = () => {
        const next = readPalette()
        markers.setMarkers(meetingMarkers(rowsRef.current, next.chart))
        chart?.applyOptions({
          layout: { textColor: next.mute, fontFamily: next.font },
          grid: { horzLines: { color: alpha(next.line, 0.9) } },
          crosshair: { vertLine: { color: alpha(next.mute, 0.6), labelBackgroundColor: next.ink }, horzLine: { color: alpha(next.mute, 0.6), labelBackgroundColor: next.ink } },
        })
        area.applyOptions({ lineColor: next.chart, topColor: alpha(next.chart, 0.32), bottomColor: alpha(next.chart, 0.02), crosshairMarkerBackgroundColor: next.chart, crosshairMarkerBorderColor: next.surface })
        sends.applyOptions({ color: alpha(next.chart, 0.25) })
      }
      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          setHover(null)
          return
        }
        const key = dayKey(param.time)
        setHover(rowsRef.current.find((row) => row.day === key) ?? null)
      })
      observer = new MutationObserver(applyPalette)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      handles.current = { chart, area, sends, markers, applyPalette }
      setReady(true)
    })
    return () => {
      disposed = true
      observer?.disconnect()
      chart?.remove()
      handles.current = null
    }
  }, [])

  useEffect(() => {
    const current = handles.current
    if (!ready || !current) return
    const palette = readPalette()
    current.sends.setData(rows.map((row) => ({ time: row.day, value: row.sent })))
    current.area.setData(
      rows.map((row) => {
        const value = valueFor(row, mode)
        return value === null ? { time: row.day } : { time: row.day, value }
      }),
    )
    current.area.applyOptions({ priceFormat: mode === 'rate' ? rateFormat : countFormat })
    current.markers.setMarkers(meetingMarkers(rows, palette.chart))
    current.chart.timeScale().fitContent()
  }, [rows, mode, ready])

  const shown = hover ?? null
  const headline = shown
    ? { label: longFormat.format(new Date(`${shown.day}T00:00:00Z`)), responses: shown.responses, sent: shown.sent, views: shown.views, meetings: shown.meetings }
    : { label: `Son ${range} gün`, ...summary }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="flex items-center gap-2 text-lg text-ink">
            {live ? <span className="live-dot" aria-hidden /> : null}
            Geri dönüşler
          </h2>
          <p className="mt-1 text-sm text-mute">Yanıt geldikçe eğri şekillenir. Noktalar görüşme isteyen kişilerin geldiği günleri gösterir.</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="text-xs text-mute">{headline.label}</div>
          <div className="mt-0.5 text-3xl tracking-tight text-ink">
            {mode === 'rate' && !shown ? (last?.rate === null || last?.rate === undefined ? '%0' : percent(last.rate)) : headline.responses}
            <span className="ml-1.5 text-sm text-mute">{mode === 'rate' && !shown ? 'yanıt oranı' : 'yanıt'}</span>
          </div>
          <div className="mt-0.5 text-xs text-mute">
            {headline.sent} gönderim · {headline.views} sayfa açılışı · {headline.meetings} görüşme
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Görünüm">
          {modes.map((item) => (
            <button key={item.key} type="button" className={`chip ${mode === item.key ? 'chip-active' : ''}`} aria-pressed={mode === item.key} onClick={() => setMode(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Zaman aralığı">
          {ranges.map((value) => (
            <button key={value} type="button" className={`chip ${range === value ? 'chip-active' : ''}`} aria-pressed={range === value} onClick={() => setRange(value)}>
              {value} gün
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-4">
        <div ref={container} className="h-[240px] w-full" />
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs rounded-2xl border border-line bg-surface/90 px-4 py-3 text-center text-sm text-mute backdrop-blur">İlk gönderimler başladığında eğri burada şekillenir.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-chart" /> {modes.find((item) => item.key === mode)?.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-2 rounded-sm bg-chart/25" /> Günlük gönderim
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-chart" /> Görüşme isteği
        </span>
      </div>
    </section>
  )
}
