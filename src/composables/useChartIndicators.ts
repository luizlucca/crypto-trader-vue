import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type IPaneApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type {
  IndicatorBar,
  IndicatorPlotPatch,
} from '@/domain/indicatorProtocol'
import type {
  IndicatorDefinition,
  IndicatorInputs,
  IndicatorInstance,
  IndicatorPlotStyle,
} from '@/domain/indicators'
import {
  createInstanceId,
  plotColor,
  plotStyleKind,
  resolveInputs,
  resolvePlotStyles,
} from '@/domain/indicators'
import {
  createIndicatorClient,
  type IndicatorBars,
  type IndicatorClient,
} from '@/services/indicators'

interface MountedIndicator {
  instance: IndicatorInstance
  definition: IndicatorDefinition
  /**
   * The pane object, not its index. Removing an indicator renumbers every pane
   * after it, so a stored index goes stale — `pane.paneIndex()` is always the
   * current position.
   */
  pane: IPaneApi<Time> | undefined
  series: Map<string, ISeriesApi<SeriesType>>
  /**
   * Plot ids that have produced at least one point. Many indicators declare
   * lines that stay empty under the current parameters — the SMA declares four
   * and draws one — and offering those in the style panel would be noise.
   */
  populated: Set<string>
}

export interface ChartIndicatorsOptions {
  /** Resolved lazily: the chart exists only after the component mounts. */
  chart: () => IChartApi | null
  /** Full history, read only when it is replaced — never per tick. */
  bars: () => IndicatorBars
  onError?: (message: string) => void
}

/**
 * Owns the chart-side lifecycle of applied indicators.
 *
 * Nothing here is reactive. Applying a patch writes straight into
 * Lightweight Charts, exactly like the candle path does: an indicator update
 * must never schedule a Vue render (ADR-0003).
 */
export function useChartIndicators(options: ChartIndicatorsOptions) {
  const mounted = new Map<string, MountedIndicator>()
  let client: IndicatorClient | undefined

  function ensureClient(): IndicatorClient {
    if (client) {
      return client
    }
    const created = createIndicatorClient(applyPatches, options.bars)
    if (options.onError) {
      created.setErrorHandler(options.onError)
    }
    client = created
    return created
  }

  function applyPatches(
    instanceId: string,
    patches: IndicatorPlotPatch[],
  ): void {
    const entry = mounted.get(instanceId)
    if (!entry) {
      return
    }
    for (const patch of patches) {
      const series = entry.series.get(patch.plotId)
      if (!series) {
        continue
      }
      if (patch.time.length > 0) {
        entry.populated.add(patch.plotId)
      }
      if (patch.full) {
        // Whole series replaced: first application or new history page.
        const points = new Array(patch.time.length)
        for (let i = 0; i < patch.time.length; i += 1) {
          points[i] = {
            time: patch.time[i] as UTCTimestamp,
            value: patch.value[i],
          }
        }
        series.setData(points)
        continue
      }
      // Ordinary tick: only the tail moved, so update point by point.
      for (let i = 0; i < patch.time.length; i += 1) {
        series.update({
          time: patch.time[i] as UTCTimestamp,
          value: patch.value[i],
        })
      }
    }
  }

  function seriesOptions(
    style: IndicatorPlotStyle,
    kind: ReturnType<typeof plotStyleKind>,
  ) {
    const color = plotColor(style)
    const shared = {
      visible: style.visible,
      priceLineVisible: false,
      lastValueVisible: false,
    }
    if (kind === 'histogram') {
      return { ...shared, color }
    }
    if (kind === 'area') {
      return {
        ...shared,
        lineColor: color,
        topColor: plotColor({ ...style, opacity: style.opacity * 0.4 }),
        bottomColor: plotColor({ ...style, opacity: 0 }),
        lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: false,
      }
    }
    return {
      ...shared,
      color,
      lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
      crosshairMarkerVisible: false,
    }
  }

  function createSeries(
    chart: IChartApi,
    definition: IndicatorDefinition,
    styles: Record<string, IndicatorPlotStyle>,
    paneIndex: number,
  ): Map<string, ISeriesApi<SeriesType>> {
    const series = new Map<string, ISeriesApi<SeriesType>>()
    for (const plot of definition.plots) {
      // The catalog says how each plot is meant to be drawn; a MACD histogram
      // rendered as a line misreads the indicator.
      const kind = plotStyleKind(plot)
      const type = kind === 'histogram'
        ? HistogramSeries
        : kind === 'area' ? AreaSeries : LineSeries
      series.set(plot.id, chart.addSeries(
        type,
        seriesOptions(styles[plot.id], kind),
        paneIndex,
      ))
    }
    return series
  }

  return {
    catalog(): Promise<IndicatorDefinition[]> {
      return ensureClient().catalog()
    },

    add(
      definition: IndicatorDefinition,
      inputs?: Readonly<Record<string, unknown>>,
    ): IndicatorInstance | null {
      const chart = options.chart()
      if (!chart) {
        return null
      }
      const instance: IndicatorInstance = {
        instanceId: createInstanceId(),
        definitionId: definition.id,
        inputs: resolveInputs(definition, inputs),
        styles: resolvePlotStyles(definition),
      }
      /*
       * Oscillators get their own pane; overlays share the price pane.
       *
       * The index is read from the chart instead of a running counter. A
       * counter drifts as soon as an oscillator is removed — the panes
       * renumber, the counter does not — and asking for an index beyond
       * `panes().length` silently produces a series that is never drawn. That
       * was the source of indicators intermittently appearing empty.
       */
      const paneIndex = definition.overlay ? 0 : chart.panes().length
      const series = createSeries(chart, definition, instance.styles, paneIndex)
      mounted.set(instance.instanceId, {
        instance,
        definition,
        pane: definition.overlay ? undefined : chart.panes()[paneIndex],
        series,
        populated: new Set(),
      })
      // The client seeds every worker it creates, so there is no "first
      // indicator" special case to get wrong here.
      const active = ensureClient()
      active.attach(instance.instanceId, definition.id, instance.inputs)
      active.compute(true)
      return instance
    },

    remove(instanceId: string): void {
      const entry = mounted.get(instanceId)
      if (!entry) {
        return
      }

      /*
       * Bookkeeping first, chart second.
       *
       * Doing it the other way round left indicators half-removed: if tearing
       * down the chart objects threw, the instance stayed registered and the
       * worker kept feeding results into series that were already gone. The
       * chart is presentation — losing a pane is cosmetic; losing the
       * bookkeeping corrupts every later calculation.
       */
      mounted.delete(instanceId)
      client?.detach(instanceId)
      if (mounted.size === 0) {
        client = undefined
      }

      const chart = options.chart()
      if (!chart) {
        return
      }
      entry.series.forEach((series) => chart.removeSeries(series))

      // Reclaim the pane once empty, so removing an oscillator leaves no blank
      // strip. `paneIndex()` returns -1 when the chart already reclaimed it,
      // and panes 0 and 1 belong to price and volume.
      const paneIndex = entry.pane?.paneIndex() ?? -1
      if (paneIndex > 1 && entry.pane?.getSeries().length === 0) {
        chart.removePane(paneIndex)
      }
    },

    updateInputs(instanceId: string, inputs: IndicatorInputs): void {
      const entry = mounted.get(instanceId)
      if (!entry || !client) {
        return
      }
      entry.instance.inputs = resolveInputs(entry.definition, inputs)
      client.reconfigure(instanceId, entry.definition.id, entry.instance.inputs)
      client.compute(true)
    },

    /**
     * Appearance only: applied straight to the series, with no recalculation.
     */
    updateStyles(
      instanceId: string,
      styles: Record<string, IndicatorPlotStyle>,
    ): void {
      const entry = mounted.get(instanceId)
      if (!entry) {
        return
      }
      entry.instance.styles = resolvePlotStyles(entry.definition, styles)
      entry.definition.plots.forEach((plot) => {
        entry.series.get(plot.id)?.applyOptions(seriesOptions(
          entry.instance.styles[plot.id],
          plotStyleKind(plot),
        ))
      })
    },

    /** Plot ids that actually produced points, for the style panel. */
    populatedPlots(instanceId: string): string[] {
      return [...(mounted.get(instanceId)?.populated ?? [])]
    },

    /**
     * Called on every realtime candle. Sends the single bar that changed and
     * asks for a recalculation; both are no-ops without indicators, and the
     * compute is coalesced inside the client.
     */
    refresh(bar: IndicatorBar): void {
      if (mounted.size === 0) {
        return
      }
      client?.appendBar(bar)
      client?.compute(false)
    },

    /** History changed underneath: drop retained results and redraw fully. */
    invalidate(): void {
      if (!client || mounted.size === 0) {
        return
      }
      client.invalidate()
      client.replaceBars(options.bars())
      client.compute(true)
    },

    instances(): IndicatorInstance[] {
      return [...mounted.values()].map((entry) => entry.instance)
    },

    /** Instances paired with their definition, for the applied list. */
    applied(): { instance: IndicatorInstance, definition: IndicatorDefinition }[] {
      return [...mounted.values()].map((entry) => ({
        instance: entry.instance,
        definition: entry.definition,
      }))
    },

    find(instanceId: string) {
      const entry = mounted.get(instanceId)
      return entry
        ? { instance: entry.instance, definition: entry.definition }
        : undefined
    },

    dispose(): void {
      const chart = options.chart()
      mounted.forEach((entry) => {
        entry.series.forEach((series) => chart?.removeSeries(series))
      })
      mounted.clear()
      client?.dispose()
      client = undefined
    },
  }
}

export type ChartIndicators = ReturnType<typeof useChartIndicators>
