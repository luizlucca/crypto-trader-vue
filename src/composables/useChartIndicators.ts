import { shallowRef } from 'vue'
import {
  AreaSeries,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type IPaneApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type {
  IndicatorBar,
  IndicatorMarker,
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
  type IndicatorPatchHandler,
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
  /** A result already arrived, so an empty `populated` is meaningful. */
  calculated: boolean
  /**
   * Markers live on the candle series, not on a series of their own — forty
   * indicators, every candlestick pattern among them, draw nothing else.
   */
  markers?: ISeriesMarkersPluginApi<Time>
}

export interface ChartIndicatorsOptions {
  /** Resolved lazily: the chart exists only after the component mounts. */
  chart: () => IChartApi | null
  /** Markers attach to the candle series, which the chart component owns. */
  candleSeries: () => ISeriesApi<SeriesType> | null
  /** Full history, read only when it is replaced — never per tick. */
  bars: () => IndicatorBars
  onError?: (message: string) => void
  /** Test seam; production always uses the real Worker-backed client. */
  createClient?: (
    onPatch: IndicatorPatchHandler,
    getBars: () => IndicatorBars,
  ) => IndicatorClient
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
  /**
   * Bumped only when the set of plots producing data changes — once per plot,
   * not per patch. `populated` itself stays a plain Set: making it reactive
   * would put the per-frame indicator path back into Vue's dependency graph.
   */
  const populatedRevision = shallowRef(0)

  function ensureClient(): IndicatorClient {
    if (client) {
      return client
    }
    const created = (options.createClient ?? createIndicatorClient)(
      applyPatches,
      options.bars,
    )
    if (options.onError) {
      created.setErrorHandler(options.onError)
    }
    client = created
    return created
  }

  function applyMarkers(
    entry: MountedIndicator,
    markers: IndicatorMarker[],
  ): void {
    const series = options.candleSeries()
    if (!series) {
      return
    }
    const points = markers.map((marker) => ({
      time: marker.time as UTCTimestamp,
      position: marker.position,
      shape: marker.shape,
      color: marker.color,
      ...(marker.size === undefined ? {} : { size: marker.size }),
      ...(marker.text === undefined ? {} : { text: marker.text }),
    })) as SeriesMarker<Time>[]

    if (entry.markers) {
      entry.markers.setMarkers(points)
      return
    }
    if (points.length > 0) {
      entry.markers = createSeriesMarkers(series, points)
    }
  }

  function applyPatches(
    instanceId: string,
    patches: IndicatorPlotPatch[],
    markers?: IndicatorMarker[],
  ): void {
    const entry = mounted.get(instanceId)
    if (!entry) {
      return
    }
    const createdNow = ensureChartObjects(entry, patches)
    const newlyPopulated: string[] = []
    try {
      if (markers) {
        applyMarkers(entry, markers)
        if (markers.length > 0 && !entry.populated.has('__markers')) {
          newlyPopulated.push('__markers')
        }
      }
      for (const patch of patches) {
        const series = entry.series.get(patch.plotId)
        if (!series) {
          if (patch.time.length > 0) {
            throw new Error(
              `Série ${patch.plotId} não está montada em ${entry.definition.name}`,
            )
          }
          continue
        }
        if (patch.time.length > 0 && !entry.populated.has(patch.plotId)) {
          newlyPopulated.push(patch.plotId)
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
          // `setData` is synchronous. A non-empty patch that leaves no data is
          // not a successful commit and must enter the bounded full retry.
          if (patch.time.length > 0 && series.data().length === 0) {
            throw new Error(
              `Lightweight Charts não reteve os dados de ${entry.definition.name}/${patch.plotId}`,
            )
          }
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

      // Commit presentation bookkeeping only after every chart mutation worked.
      // If one setData/update throws, the client requests a complete retry and
      // this instance never advertises a half-applied result as calculated.
      let presentationChanged = false
      for (const plotId of newlyPopulated) {
        if (!entry.populated.has(plotId)) {
          entry.populated.add(plotId)
          presentationChanged = true
        }
      }
      if (!entry.calculated) {
        entry.calculated = true
        presentationChanged = true
      }
      if (presentationChanged) {
        populatedRevision.value += 1
      }
    } catch (error) {
      if (createdNow) {
        const chart = options.chart()
        if (chart) {
          // Initial application is atomic: never retain a pane containing a
          // partially-filled set of series after one plot failed.
          removeChartObjects(chart, entry)
        }
      }
      throw error
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
    pane: IPaneApi<Time> | undefined,
    series: Map<string, ISeriesApi<SeriesType>>,
  ): Map<string, ISeriesApi<SeriesType>> {
    for (const plot of definition.plots) {
      // The catalog says how each plot is meant to be drawn; a MACD histogram
      // rendered as a line misreads the indicator.
      const kind = plotStyleKind(plot)
      const type = kind === 'histogram'
        ? HistogramSeries
        : kind === 'area' ? AreaSeries : LineSeries
      const created = pane
        ? pane.addSeries(type, seriesOptions(styles[plot.id], kind))
        : chart.addSeries(type, seriesOptions(styles[plot.id], kind), 0)
      series.set(plot.id, created)
    }
    return series
  }

  /**
   * Mounts visual objects only once the worker has produced drawable data.
   * A slow or failed calculation therefore cannot expose a permanent empty
   * pane, and the ordinary realtime path pays only the `series.size` check.
   */
  function ensureChartObjects(
    entry: MountedIndicator,
    patches: IndicatorPlotPatch[],
  ): boolean {
    if (
      entry.series.size > 0
      || !patches.some((patch) => patch.time.length > 0)
    ) {
      return false
    }
    const chart = options.chart()
    if (!chart) {
      throw new Error(`Gráfico indisponível ao montar ${entry.definition.name}`)
    }

    try {
      entry.pane = entry.definition.overlay ? undefined : chart.addPane(true)
      createSeries(
        chart,
        entry.definition,
        entry.instance.styles,
        entry.pane,
        entry.series,
      )
      return true
    } catch (error) {
      removeChartObjects(chart, entry)
      throw error
    }
  }

  function removeChartObjects(
    chart: IChartApi,
    entry: MountedIndicator,
  ): void {
    const failures: string[] = []
    try {
      entry.markers?.setMarkers([])
    } catch (error) {
      failures.push(
        `markers: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    entry.markers = undefined

    entry.series.forEach((series, plotId) => {
      try {
        chart.removeSeries(series)
      } catch (error) {
        failures.push(
          `${plotId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })
    entry.series.clear()

    const paneIndex = entry.pane?.paneIndex() ?? -1
    const paneIsEmpty = entry.pane?.getSeries().length === 0
    if (paneIndex >= 0 && paneIsEmpty) {
      try {
        // Oscillator panes are created with preserveEmptyPane=true, so their
        // lifetime is explicit and cannot race the last removeSeries call.
        chart.removePane(paneIndex)
        entry.pane = undefined
      } catch (error) {
        failures.push(
          `pane ${paneIndex}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    } else if (paneIndex >= 0 && !paneIsEmpty) {
      failures.push(`pane ${paneIndex}: ainda contém séries após a desmontagem`)
    }
    if (failures.length > 0) {
      options.onError?.(
        `Falha ao desmontar ${entry.definition.name}: ${failures.join('; ')}`,
      )
    }
  }

  return {
    catalog(): Promise<IndicatorDefinition[]> {
      return ensureClient().catalog()
    },

    add(
      definition: IndicatorDefinition,
      inputs?: Readonly<Record<string, unknown>>,
      restore?: Pick<IndicatorInstance, 'instanceId' | 'styles'>,
    ): IndicatorInstance | null {
      const chart = options.chart()
      if (!chart) {
        return null
      }
      const instance: IndicatorInstance = {
        // Restoring keeps the id, so a layout survives the chart being rebuilt
        // without the applied list appearing to change identity.
        instanceId: restore?.instanceId ?? createInstanceId(),
        definitionId: definition.id,
        inputs: resolveInputs(definition, inputs),
        styles: resolvePlotStyles(definition, restore?.styles),
      }
      const series = new Map<string, ISeriesApi<SeriesType>>()
      mounted.set(instance.instanceId, {
        instance,
        definition,
        // Pane and series are mounted transactionally by the first non-empty
        // result, so calculation latency is never represented by a blank pane.
        pane: undefined,
        series,
        populated: new Set(),
        calculated: false,
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
      removeChartObjects(chart, entry)
    },

    updateInputs(instanceId: string, inputs: IndicatorInputs): void {
      const entry = mounted.get(instanceId)
      if (!entry || !client) {
        return
      }
      entry.instance.inputs = resolveInputs(entry.definition, inputs)
      // New parameters can switch lines on or off, so the record is rebuilt.
      entry.populated.clear()
      entry.calculated = false
      populatedRevision.value += 1
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

    /** True once a result arrived for this instance. */
    hasCalculated(instanceId: string): boolean {
      void populatedRevision.value
      return mounted.get(instanceId)?.calculated ?? false
    },

    /** Plot ids that actually produced points, for the style panel. */
    populatedPlots(instanceId: string): string[] {
      // Read so the template re-evaluates when the set changes.
      void populatedRevision.value
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
        if (chart) {
          removeChartObjects(chart, entry)
        } else {
          entry.markers?.setMarkers([])
        }
      })
      mounted.clear()
      client?.dispose()
      client = undefined
    },
  }
}

export type ChartIndicators = ReturnType<typeof useChartIndicators>
