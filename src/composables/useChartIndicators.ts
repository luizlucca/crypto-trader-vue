import { shallowRef } from 'vue'
import {
  AreaSeries,
  CandlestickSeries,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPaneApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  BAR_COLOR_PLOT,
  type IndicatorBar,
  type IndicatorCandlePatch,
  type IndicatorMarker,
  type IndicatorPlotPatch,
} from '@/domain/indicatorProtocol'
import {
  hasDrawings,
  type IndicatorDrawings,
} from '@/domain/indicatorDrawings'
import { readableOnCached } from '@/domain/readableColor'
import {
  createInstanceId,
  plotColor,
  plotStyleKind,
  resolveInputs,
  resolvePlotStyles,
  type IndicatorDefinition,
  type IndicatorInputs,
  type IndicatorInstance,
  type IndicatorPlotStyle,
  type AppliedIndicator,
} from '@/domain/indicators'
import {
  createIndicatorClient,
  type IndicatorBars,
  type IndicatorClient,
  type IndicatorPatchHandler,
  type IndicatorResultParts,
} from '@/services/indicators'
import {
  publishIndicatorReadout,
  resetIndicatorReadout,
} from '@/services/indicatorReadout'
import {
  IndicatorDrawingsPrimitive,
} from '@/plugins/indicatorDrawings/IndicatorDrawingsPrimitive'
import {
  RoundedCandleSeries,
} from '@/plugins/roundedCandles/RoundedCandleSeries'

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
  /** Reused transaction buffer; avoids allocating an empty array per tick. */
  pendingPopulated: string[]
  /** A result already arrived, so an empty `populated` is meaningful. */
  calculated: boolean
  /**
   * Last value of each plot, kept as the legend's resting state.
   *
   * Read from the patches as they are applied — one number per plot per tick —
   * because asking the series for it would copy the whole data array on a path
   * that runs per pointer move.
   */
  lastValues: Map<string, number>
  /**
   * Markers live on the candle series, not on a series of their own — forty
   * indicators, every candlestick pattern among them, draw nothing else.
   */
  markers?: ISeriesMarkersPluginApi<Time>
  /**
   * Free-form shapes, drawn by a primitive attached to a host series. The host
   * is recorded because detaching needs the same series that received it.
   */
  drawings?: {
    primitive: IndicatorDrawingsPrimitive
    host: ISeriesApi<SeriesType>
  }
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
 * Candle outputs share the series map with the plots, so their keys are
 * prefixed: the catalog is free to name a candle output `plot0` too.
 */
function candleSeriesId(plotId: string): string {
  return `candles:${plotId}`
}

/** Indicator-painted bars must not inherit a colour from their series. */
const CANDLE_OPTIONS = {
  priceLineVisible: false,
  lastValueVisible: false,
} as const

function indicatorCandlePoint(
  patch: IndicatorCandlePatch,
  index: number,
  colored: boolean,
) {
  const candle = {
    time: patch.time[index] as UTCTimestamp,
    open: patch.open[index],
    high: patch.high[index],
    low: patch.low[index],
    close: patch.close[index],
  }
  if (!colored) {
    return candle
  }
  const shade = patch.palette[patch.colorIndex[index]]
  return shade ? Object.assign(candle, shade) : candle
}

function applyCandlePatch(
  series: ISeriesApi<SeriesType>,
  patch: IndicatorCandlePatch,
): void {
  const colored = patch.palette.length > 0
  if (patch.full) {
    const points = new Array(patch.time.length)
    for (let i = 0; i < patch.time.length; i += 1) {
      points[i] = indicatorCandlePoint(patch, i, colored)
    }
    series.setData(points)
    return
  }
  for (let i = 0; i < patch.time.length; i += 1) {
    series.update(indicatorCandlePoint(patch, i, colored))
  }
}

/**
 * The surface every indicator is drawn against. Read from the published theme
 * token rather than from the chart, so it is current the moment the theme
 * changes and costs nothing to ask for.
 */
function chartSurface(): string {
  if (typeof document === 'undefined') {
    return '#000000'
  }
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--chart-bg')
    .trim() || '#000000'
}

/**
 * Adapts a colour only while it is still the catalog's own. The moment the
 * operator picks one, it is a decision — and correcting a decision would be
 * worse than the problem this solves.
 */
function themedColor(color: string, catalogColor: string | undefined): string {
  if (!catalogColor || color.toLowerCase() !== catalogColor.toLowerCase()) {
    return color
  }
  return readableOnCached(color, chartSurface())
}

/**
 * Formats an indicator value the way a chart legend does: enough digits to
 * distinguish two candles, never so many that the number stops being readable
 * at a glance. An oscillator lives in tens, a price in thousands, and both
 * appear in the same row.
 */
function formatValue(value: number): string {
  const size = Math.abs(value)
  if (size >= 1000) {
    return value.toFixed(0)
  }
  if (size >= 1) {
    return value.toFixed(2)
  }
  return value.toPrecision(3)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function priceLineStyle(
  style: IndicatorDefinition['hlines'][number]['linestyle'],
): LineStyle {
  if (style === 'dashed') {
    return LineStyle.Dashed
  }
  if (style === 'dotted') {
    return LineStyle.Dotted
  }
  return LineStyle.Solid
}

/** Names the worker's raw output keys in the language of the interface. */
const OUTPUT_LABELS: Record<string, string> = {
  lines: 'linhas livres',
  boxes: 'caixas',
  labels: 'rótulos',
  bgColors: 'faixas de fundo',
  barColors: 'coloração das barras',
  pivots: 'pivôs',
}

/**
 * Turns a blank result into a reason. An indicator that draws nothing is either
 * asking for a kind of drawing this chart has no counterpart for, or genuinely
 * has no points to show — and the operator needs to tell those apart before
 * trusting an empty pane.
 */
function explainBlankResult(name: string, outputs: readonly string[]): string {
  if (outputs.length === 0) {
    return `${name} não produziu valores com os parâmetros atuais e o `
      + 'histórico carregado.'
  }
  const named = outputs.map((output) => OUTPUT_LABELS[output] ?? output)
  const listed = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(', ')} e ${named[named.length - 1]}`
  return `${name} desenha por ${listed}, um recurso que o gráfico ainda não `
    + 'suporta.'
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
  /**
   * Constant-time ownership lookup for Lightweight Charts hover events.
   *
   * A WeakMap avoids retaining a removed series and, more importantly, avoids
   * scanning every applied indicator on each pointer pixel.
   */
  const seriesOwners = new WeakMap<ISeriesApi<SeriesType>, string>()
  let client: IndicatorClient | undefined
  /**
   * Bumped only when the set of plots producing data changes — once per plot,
   * not per patch. `populated` itself stays a plain Set: making it reactive
   * would put the per-frame indicator path back into Vue's dependency graph.
   */
  const populatedRevision = shallowRef(0)
  /** Indicator whose chart series currently owns the contextual readout. */
  let hoveredInstanceId: string | undefined

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
    created.setNoOutputHandler((instanceId, outputs) => {
      const entry = mounted.get(instanceId)
      if (entry) {
        options.onError?.(explainBlankResult(entry.definition.name, outputs))
      }
    })
    client = created
    return created
  }

  /** Publishes one value per visible plot, at the cursor or at rest. */
  function publishReadout(
    entry: MountedIndicator,
    seriesData?: Map<ISeriesApi<SeriesType>, unknown>,
  ): void {
    for (const plot of entry.definition.plots) {
      const series = entry.series.get(plot.id)
      if (!series || !entry.instance.styles[plot.id]?.visible) {
        continue
      }
      const point = seriesData?.get(series) as { value?: number } | undefined
      /*
       * With the cursor off the chart the legend rests on the last bar instead
       * of going blank: the current value of an indicator is what the operator
       * wants at a glance, and an empty row would look broken.
       */
      const value = point !== undefined && Number.isFinite(point.value)
        ? point.value as number
        : entry.lastValues.get(plot.id)
      if (value === undefined) {
        continue
      }
      publishIndicatorReadout(
        entry.instance.instanceId,
        plot.id,
        formatValue(value),
      )
    }
  }

  function applyMarkers(
    entry: MountedIndicator,
    markers: IndicatorMarker[],
  ): void {
    const series = options.candleSeries()
    if (!series) {
      return
    }
    const surface = chartSurface()
    const points = new Array<SeriesMarker<Time>>(markers.length)
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index]
      points[index] = {
        time: marker.time as UTCTimestamp,
        position: marker.position,
        shape: marker.shape,
        color: readableOnCached(marker.color, surface),
        ...(marker.size === undefined ? {} : { size: marker.size }),
        ...(marker.text === undefined ? {} : { text: marker.text }),
      } as SeriesMarker<Time>
    }

    if (entry.markers) {
      entry.markers.setMarkers(points)
      return
    }
    if (points.length > 0) {
      entry.markers = createSeriesMarkers(series, points)
    }
  }

  /**
   * Attaches the drawing primitive on first use and hands it the shapes.
   *
   * The host is the indicator's own first series when it has one, and the
   * candle series otherwise: an overlay like the Zig Zag declares no plot at
   * all, and its shapes are anchored to prices, which is the scale the candles
   * own. An oscillator without a series of its own has no price scale to
   * anchor to, and saying so is better than drawing against the wrong prices.
   *
   * Bands are the exception: they span the full height of the pane and read
   * only the time scale, so they need no price scale to be correct — a session
   * marked on the clock applies to the whole chart, whatever the indicator's
   * own pane would have shown.
   */
  function applyDrawings(
    entry: MountedIndicator,
    drawings: IndicatorDrawings,
  ): void {
    if (!entry.drawings) {
      const own = entry.series.values().next().value
      const needsPriceScale = drawings.lines.length > 0
        || drawings.boxes.length > 0
        || drawings.labels.length > 0
      let host = own
      if (!host && (entry.definition.overlay || !needsPriceScale)) {
        host = options.candleSeries() ?? undefined
      }
      if (!host) {
        throw new Error(
          `Sem série para ancorar os desenhos de ${entry.definition.name}`,
        )
      }
      const primitive = new IndicatorDrawingsPrimitive()
      host.attachPrimitive(primitive)
      entry.drawings = { primitive, host }
    }
    entry.drawings.primitive.setDrawings(drawings)
  }

  function rememberLastValue(
    entry: MountedIndicator,
    patch: IndicatorPlotPatch,
  ): void {
    const lastValue = patch.value[patch.value.length - 1]
    if (lastValue !== undefined) {
      entry.lastValues.set(patch.plotId, lastValue)
    }
  }

  function applyPlotPatch(
    entry: MountedIndicator,
    patch: IndicatorPlotPatch,
    newlyPopulated: string[],
  ): void {
    const series = entry.series.get(patch.plotId)
    if (!series) {
      if (patch.time.length > 0) {
        throw new Error(
          `Série ${patch.plotId} não está montada em ${entry.definition.name}`,
        )
      }
      return
    }
    if (patch.time.length > 0 && !entry.populated.has(patch.plotId)) {
      newlyPopulated.push(patch.plotId)
    }

    if (patch.full) {
      const points = new Array(patch.time.length)
      for (let i = 0; i < patch.time.length; i += 1) {
        points[i] = {
          time: patch.time[i] as UTCTimestamp,
          value: patch.value[i],
        }
      }
      series.setData(points)
      rememberLastValue(entry, patch)
      // `setData` is synchronous. A non-empty patch that leaves no data is
      // not a successful commit and must enter the bounded full retry.
      if (patch.time.length > 0 && series.data().length === 0) {
        throw new Error(
          'Lightweight Charts não reteve os dados de '
          + `${entry.definition.name}/${patch.plotId}`,
        )
      }
      return
    }

    // Ordinary tick: only the tail moved, so update point by point.
    for (let i = 0; i < patch.time.length; i += 1) {
      series.update({
        time: patch.time[i] as UTCTimestamp,
        value: patch.value[i],
      })
    }
    rememberLastValue(entry, patch)
  }

  function applyCandlePatches(
    entry: MountedIndicator,
    patches: readonly IndicatorCandlePatch[] | undefined,
    newlyPopulated: string[],
  ): void {
    if (!patches) {
      return
    }
    for (const patch of patches) {
      const series = entry.series.get(candleSeriesId(patch.plotId))
      if (!series) {
        throw new Error(
          `Série de velas ${patch.plotId} não está montada em `
          + entry.definition.name,
        )
      }
      if (!entry.populated.has(patch.plotId)) {
        newlyPopulated.push(patch.plotId)
      }
      applyCandlePatch(series, patch)
    }
  }

  function commitPresentation(
    entry: MountedIndicator,
    newlyPopulated: readonly string[],
  ): void {
    let changed = false
    for (const plotId of newlyPopulated) {
      if (!entry.populated.has(plotId)) {
        entry.populated.add(plotId)
        changed = true
      }
    }
    if (!entry.calculated) {
      entry.calculated = true
      changed = true
    }
    if (changed) {
      populatedRevision.value += 1
    }
  }

  function applyPatches(
    instanceId: string,
    result: IndicatorResultParts,
  ): void {
    const entry = mounted.get(instanceId)
    if (!entry) {
      return
    }
    const { patches, markers, candles, drawings } = result
    const createdNow = ensureChartObjects(entry, patches, candles, drawings)
    const newlyPopulated = entry.pendingPopulated
    newlyPopulated.length = 0
    try {
      if (drawings) {
        applyDrawings(entry, drawings)
        if (hasDrawings(drawings) && !entry.populated.has('__drawings')) {
          newlyPopulated.push('__drawings')
        }
      }
      if (markers) {
        applyMarkers(entry, markers)
        if (markers.length > 0 && !entry.populated.has('__markers')) {
          newlyPopulated.push('__markers')
        }
      }
      applyCandlePatches(entry, candles, newlyPopulated)
      for (const patch of patches) {
        applyPlotPatch(entry, patch, newlyPopulated)
      }

      // Commit presentation bookkeeping only after every chart mutation worked.
      // If one setData/update throws, the client requests a complete retry and
      // this instance never advertises a half-applied result as calculated.
      commitPresentation(entry, newlyPopulated)
      if (hoveredInstanceId !== instanceId) {
        // A hovered series keeps the value under the cursor. Every other
        // indicator keeps its cached resting value current for chip hover.
        publishReadout(entry)
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
    } finally {
      newlyPopulated.length = 0
    }
  }

  function seriesOptions(
    style: IndicatorPlotStyle,
    kind: ReturnType<typeof plotStyleKind>,
    catalogColor?: string,
  ) {
    const color = plotColor({
      ...style,
      color: themedColor(style.color, catalogColor),
    })
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
    entry: MountedIndicator,
  ): void {
    const { definition, pane } = entry
    for (const plot of definition.plots) {
      // The catalog says how each plot is meant to be drawn; a MACD histogram
      // rendered as a line misreads the indicator.
      const kind = plotStyleKind(plot)
      const options = seriesOptions(
        entry.instance.styles[plot.id],
        kind,
        plot.color,
      )
      let created: ISeriesApi<SeriesType>
      if (kind === 'histogram') {
        created = pane
          ? pane.addSeries(HistogramSeries, options)
          : chart.addSeries(HistogramSeries, options, 0)
      } else if (kind === 'area') {
        created = pane
          ? pane.addSeries(AreaSeries, options)
          : chart.addSeries(AreaSeries, options, 0)
      } else {
        created = pane
          ? pane.addSeries(LineSeries, options)
          : chart.addSeries(LineSeries, options, 0)
      }
      entry.series.set(plot.id, created)
      seriesOwners.set(created, entry.instance.instanceId)
    }
  }

  /**
   * Repainted market bars keep the chart's own candle shape: they cover the
   * real candles, and a different silhouette would read as a second series
   * rather than as the same bars in another colour. Two indicators repainting
   * at once is resolved by the chart itself — the last one mounted draws on
   * top, which is also the last one the operator applied.
   */
  function createCandleSeries(
    chart: IChartApi,
    pane: IPaneApi<Time> | undefined,
    plotId: string,
  ): ISeriesApi<SeriesType> {
    if (plotId === BAR_COLOR_PLOT) {
      return chart.addCustomSeries(new RoundedCandleSeries(), {
        ...CANDLE_OPTIONS,
        wickVisible: true,
        radius: (barSpacing: number) => (
          barSpacing < 4 ? 0 : Math.min(4, barSpacing / 3)
        ),
      }, 0) as unknown as ISeriesApi<SeriesType>
    }
    return pane
      ? pane.addSeries(CandlestickSeries, CANDLE_OPTIONS)
      : chart.addSeries(CandlestickSeries, CANDLE_OPTIONS, 0)
  }

  /**
   * Reference levels declared by the indicator: the RSI 30/70 band, the MACD
   * zero line, the stochastic 20/80. Without them an oscillator is a shape with
   * no scale to read it against, which is precisely what the pane is for.
   *
   * Price lines belong to the series and are disposed with it, so they need no
   * bookkeeping of their own. Only oscillators declare levels — a fixed price
   * drawn across the candle pane would be meaningless — and the guard keeps it
   * that way if the catalog ever changes.
   */
  function createHLines(
    definition: IndicatorDefinition,
    anchor: ISeriesApi<SeriesType> | undefined,
  ): void {
    if (!anchor || definition.overlay) {
      return
    }
    const surface = chartSurface()
    for (const hline of definition.hlines) {
      if (!Number.isFinite(hline.price)) {
        continue
      }
      anchor.createPriceLine({
        price: hline.price,
        color: readableOnCached(hline.color ?? '#787B86', surface, 1.8),
        lineWidth: 1,
        lineStyle: priceLineStyle(hline.linestyle),
        // The pane's own price scale already shows the values; a label per
        // level would cover a third of a 120px pane.
        axisLabelVisible: false,
        title: '',
      })
    }
  }

  /**
   * Mounts visual objects only once the worker has produced drawable data.
   * A slow or failed calculation therefore cannot expose a permanent empty
   * pane, and the ordinary realtime path pays only the `series.size` check.
   */
  function ensureChartObjects(
    entry: MountedIndicator,
    patches: IndicatorPlotPatch[],
    candles?: IndicatorCandlePatch[],
    drawings?: IndicatorDrawings,
  ): boolean {
    if (entry.series.size > 0 || entry.drawings) {
      return false
    }
    const hasData = patches.some((patch) => patch.time.length > 0)
      || (candles?.length ?? 0) > 0
      || hasDrawings(drawings)
    if (!hasData) {
      return false
    }
    const chart = options.chart()
    if (!chart) {
      throw new Error(`Gráfico indisponível ao montar ${entry.definition.name}`)
    }

    /*
     * A pane is created only for what will actually live in it. An indicator
     * declared as "own pane" that turns out to draw only vertical bands hosts
     * them on the price pane — its own pane would stay empty, and an empty
     * strip below the chart reads as something broken.
     */
    const ownPaneContent = patches.some((patch) => patch.time.length > 0)
      || (candles?.some((patch) => patch.plotId !== BAR_COLOR_PLOT) ?? false)

    try {
      entry.pane = entry.definition.overlay || !ownPaneContent
        ? undefined
        : chart.addPane(true)
      createSeries(chart, entry)
      /*
       * Candle outputs are not declared in `plotConfig` — the catalog describes
       * them only through the result — so the first result is what says they
       * exist. The CVD, the volume delta and the Heikin-Ashi variants draw
       * exclusively this way.
       */
      for (const patch of candles ?? []) {
        const series = createCandleSeries(chart, entry.pane, patch.plotId)
        entry.series.set(candleSeriesId(patch.plotId), series)
        seriesOwners.set(series, entry.instance.instanceId)
      }
      createHLines(entry.definition, entry.series.values().next().value)
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
        `markers: ${errorMessage(error)}`,
      )
    }
    entry.markers = undefined

    if (entry.drawings) {
      try {
        // Detached from the same series that received it: the primitive may be
        // hosted on the candle series, which outlives the indicator.
        entry.drawings.host.detachPrimitive(entry.drawings.primitive)
      } catch (error) {
        failures.push(
          `desenhos: ${errorMessage(error)}`,
        )
      }
      entry.drawings = undefined
    }

    entry.series.forEach((series, plotId) => {
      try {
        chart.removeSeries(series)
      } catch (error) {
        failures.push(
          `${plotId}: ${errorMessage(error)}`,
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
          `pane ${paneIndex}: ${errorMessage(error)}`,
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

  function applyStyles(entry: MountedIndicator): void {
    for (const plot of entry.definition.plots) {
      entry.series.get(plot.id)?.applyOptions(seriesOptions(
        entry.instance.styles[plot.id],
        plotStyleKind(plot),
        plot.color,
      ))
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
        pendingPopulated: [],
        calculated: false,
        lastValues: new Map(),
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
      if (hoveredInstanceId === instanceId) {
        hoveredInstanceId = undefined
      }
      resetIndicatorReadout(instanceId)
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
      entry.lastValues.clear()
      entry.calculated = false
      resetIndicatorReadout(instanceId)
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
      applyStyles(entry)
      resetIndicatorReadout(instanceId)
      publishReadout(entry)
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
      const active = client
      if (mounted.size === 0 || !active) {
        return
      }
      active.appendBar(bar)
      active.compute(false)
    },

    /**
     * Publishes values only for the indicator series under the pointer.
     *
     * Lightweight Charts supplies `hoveredInfo.series`; the WeakMap resolves
     * its owner in constant time. The hot path formats one indicator and never
     * schedules Vue work.
     */
    readCursor(
      seriesData: Map<ISeriesApi<SeriesType>, unknown>,
      hoveredSeries?: ISeriesApi<SeriesType>,
    ): string | undefined {
      const candidateId = hoveredSeries
        ? seriesOwners.get(hoveredSeries)
        : undefined
      const nextId = candidateId && mounted.has(candidateId)
        ? candidateId
        : undefined

      if (hoveredInstanceId !== nextId) {
        const previous = hoveredInstanceId
          ? mounted.get(hoveredInstanceId)
          : undefined
        hoveredInstanceId = nextId
        if (previous) {
          publishReadout(previous)
        }
      }

      if (!nextId) {
        return undefined
      }
      const entry = mounted.get(nextId)!
      publishReadout(entry, seriesData)
      return nextId
    },

    /** Makes a chip show the indicator's latest computed values. */
    previewReadout(instanceId: string): void {
      const entry = mounted.get(instanceId)
      if (entry) {
        publishReadout(entry)
      }
    },

    /**
     * The theme changed: catalog colours are resolved against the new surface.
     * Only appearance is touched — no recalculation, no data leaves the worker.
     */
    retheme(): void {
      for (const entry of mounted.values()) {
        applyStyles(entry)
      }
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
    applied(): AppliedIndicator[] {
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
      for (const [instanceId, entry] of mounted) {
        resetIndicatorReadout(instanceId)
        if (chart) {
          removeChartObjects(chart, entry)
        } else {
          entry.markers?.setMarkers([])
        }
      }
      mounted.clear()
      hoveredInstanceId = undefined
      client?.dispose()
      client = undefined
    },
  }
}

export type ChartIndicators = ReturnType<typeof useChartIndicators>
