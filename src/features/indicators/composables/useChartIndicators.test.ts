import { describe, expect, it, vi } from 'vitest'
import { LineStyle } from 'lightweight-charts'
import type {
  IChartApi,
  IPaneApi,
  ISeriesApi,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { IndicatorPlotPatch } from '@indicators/domain/indicatorProtocol'
import type { IndicatorDefinition } from '@indicators/domain/indicators'
import type {
  IndicatorClient,
  IndicatorPatchHandler,
} from '@indicators/services/indicators'
import { peekIndicatorReadout } from '@indicators/services/indicatorReadout'
import { readableOnCached } from '@settings/domain/readableColor'
import { useChartIndicators } from './useChartIndicators'

const definition: IndicatorDefinition = {
  id: 'mfi-rsi-bb',
  name: 'MFI/RSI Bollinger Bands',
  shortName: 'MFIRSBB',
  description: '',
  category: 'Oscillators',
  overlay: false,
  group: 'community',
  inputs: [],
  plots: [0, 1, 2, 3].map((index) => ({
    id: `plot${index}`,
    title: `Plot ${index}`,
    color: '#2f9cff',
  })),
  hlines: [],
  defaults: {},
}

class FakeSeries {
  points: unknown[] = []
  readonly appliedOptions: unknown[] = []
  readonly priceLines: Array<{
    price: number
    lineStyle: number
    updates: unknown[]
  }> = []

  readonly primitives: unknown[] = []

  attachPrimitive(primitive: unknown): void {
    this.primitives.push(primitive)
  }

  detachPrimitive(primitive: unknown): void {
    const index = this.primitives.indexOf(primitive)
    if (index >= 0) this.primitives.splice(index, 1)
  }

  createPriceLine(options: { price: number, lineStyle: number }): unknown {
    const line = { ...options, updates: [] as unknown[] }
    this.priceLines.push(line)
    return {
      applyOptions: (update: unknown) => line.updates.push(update),
    }
  }

  setData(points: unknown[]): void {
    this.points = points
  }

  update(point: unknown): void {
    this.points.push(point)
  }

  data(): readonly unknown[] {
    return this.points
  }

  applyOptions(options: unknown): void {
    this.appliedOptions.push(options)
  }

  moveToPane(index: number): void {
    this.movedTo = index
  }

  movedTo: number | undefined
}

class FakePane {
  index: number
  readonly series: FakeSeries[] = []

  constructor(index: number) {
    this.index = index
  }

  addSeries(): ISeriesApi<SeriesType> {
    const series = new FakeSeries()
    this.series.push(series)
    return series as unknown as ISeriesApi<SeriesType>
  }

  getSeries(): ISeriesApi<SeriesType>[] {
    return this.series as unknown as ISeriesApi<SeriesType>[]
  }

  paneIndex(): number {
    return this.index
  }
}

function chartHarness() {
  const panes = [new FakePane(0), new FakePane(1)]
  const chart = {
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      setVisibleLogicalRange: vi.fn(),
    }),
    addPane: vi.fn(() => {
      const pane = new FakePane(panes.length)
      panes.push(pane)
      return pane as unknown as IPaneApi<Time>
    }),
    // Overlays go straight to the chart with an explicit pane index.
    addSeries: vi.fn((
      _type: unknown,
      _options: unknown,
      paneIndex = 0,
    ) => panes[paneIndex].addSeries()),
    removeSeries: vi.fn((target: ISeriesApi<SeriesType>) => {
      for (const pane of panes) {
        const index = pane.series.indexOf(target as unknown as FakeSeries)
        if (index >= 0) pane.series.splice(index, 1)
      }
    }),
    removePane: vi.fn((index: number) => {
      const [removed] = panes.splice(index, 1)
      if (removed) removed.index = -1
      panes.forEach((pane, paneIndex) => {
        pane.index = paneIndex
      })
    }),
  }
  return {
    chart: chart as unknown as IChartApi,
    panes,
    api: chart,
    /** Every reference level drawn, in creation order. */
    priceLines: () => panes.flatMap((pane) => (
      pane.series.flatMap((series) => series.priceLines)
    )),
  }
}

function stubClient(): IndicatorClient {
  return {
    attach: vi.fn(),
    compute: vi.fn(),
    detach: vi.fn(),
    setErrorHandler: vi.fn(),
    setNoOutputHandler: vi.fn(),
    dispose: vi.fn(),
  } as unknown as IndicatorClient
}

function patches(): IndicatorPlotPatch[] {
  return definition.plots.map((plot) => ({
    plotId: plot.id,
    full: true,
    from: 0,
    time: Float64Array.from([1, 2, 3]),
    value: Float64Array.from([40, 50, 60]),
  }))
}

describe('chart indicator visual lifecycle', () => {
  it('recalcula cores de catálogo para a superfície recebida no retheme', () => {
    const { chart, panes } = chartHarness()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })
    const instance = indicators.add(definition)!
    apply(instance.instanceId, { patches: patches() })

    indicators.retheme('#FFFFFF')

    const plot = definition.plots[0]!
    const series = panes[2].series[0]
    expect(series.appliedOptions.at(-1)).toMatchObject({
      color: readableOnCached(plot.color!, '#FFFFFF'),
    })
  })

  it('reads only the indicator series currently under the pointer', () => {
    const { chart, panes } = chartHarness()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })

    const first = indicators.add(definition)!
    const second = indicators.add(definition)!
    apply(first.instanceId, { patches: patches() })
    apply(second.instanceId, { patches: patches() })

    const firstSeries = panes[2].series[0] as unknown as ISeriesApi<SeriesType>
    const secondSeries = panes[3].series[0] as unknown as ISeriesApi<SeriesType>
    const restingFirst = peekIndicatorReadout(first.instanceId, 'plot0')
    const restingSecond = peekIndicatorReadout(second.instanceId, 'plot0')
    const cursorData = new Map<ISeriesApi<SeriesType>, unknown>([
      [firstSeries, { value: 12 }],
      [secondSeries, { value: 34 }],
    ])

    expect(indicators.readCursor(cursorData, firstSeries)).toBe(
      first.instanceId,
    )
    expect(peekIndicatorReadout(first.instanceId, 'plot0')).toBe('12.00')
    expect(peekIndicatorReadout(second.instanceId, 'plot0'))
      .toBe(restingSecond)

    expect(indicators.readCursor(cursorData, secondSeries)).toBe(
      second.instanceId,
    )
    expect(peekIndicatorReadout(first.instanceId, 'plot0'))
      .toBe(restingFirst)
    expect(peekIndicatorReadout(second.instanceId, 'plot0')).toBe('34.00')

    expect(indicators.readCursor(cursorData)).toBeUndefined()
    expect(peekIndicatorReadout(second.instanceId, 'plot0'))
      .toBe(restingSecond)
  })

  it('creates an oscillator pane only after data arrives and removes it cleanly', () => {
    const { chart, panes, api } = chartHarness()
    let apply!: IndicatorPatchHandler
    const client = stubClient()
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return client
      },
    })

    const instance = indicators.add(definition)
    expect(instance).not.toBeNull()
    expect(api.addPane).not.toHaveBeenCalled()
    expect(panes).toHaveLength(2)

    apply(instance!.instanceId, { patches: patches() })

    expect(api.addPane).toHaveBeenCalledOnce()
    expect(panes).toHaveLength(3)
    expect(panes[2].series).toHaveLength(4)
    expect(panes[2].series.every((series) => series.points.length === 3)).toBe(true)

    indicators.remove(instance!.instanceId)
    expect(api.removeSeries).toHaveBeenCalledTimes(4)
    expect(api.removePane).toHaveBeenCalledWith(2)
    expect(panes).toHaveLength(2)
  })

  it('draws the declared reference levels on the oscillator pane', () => {
    const { chart, priceLines } = chartHarness()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })

    const withLevels: IndicatorDefinition = {
      ...definition,
      hlines: [
        { id: 'upper', price: 70, color: '#787B86', linestyle: 'dashed' },
        { id: 'mid', price: 50 },
        { id: 'lower', price: 30, linestyle: 'dotted' },
      ],
    }
    const instance = indicators.add(withLevels)
    apply(instance!.instanceId, { patches: patches() })

    // Anchored on one series: three levels, not one set per plot.
    const drawn = priceLines()
    expect(drawn.map((line) => line.price)).toEqual([70, 50, 30])
    expect(drawn.map((line) => line.lineStyle)).toEqual([
      LineStyle.Dashed,
      LineStyle.Solid,
      LineStyle.Dotted,
    ])

    indicators.retheme('#FFFFFF')
    expect(drawn[0].updates.at(-1)).toEqual({
      color: readableOnCached('#787B86', '#FFFFFF', 1.8),
    })
  })

  it('keeps reference levels off the candle pane for overlays', () => {
    const { chart, priceLines } = chartHarness()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })

    const overlay: IndicatorDefinition = {
      ...definition,
      overlay: true,
      hlines: [{ id: 'zero', price: 0 }],
    }
    const instance = indicators.add(overlay)
    apply(instance!.instanceId, { patches: patches() })

    expect(priceLines()).toHaveLength(0)
  })

  it('mounts a candlestick series for an indicator that draws its own candles', () => {
    const { chart, panes, api } = chartHarness()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })

    // The CVD declares no plots at all: the result is what says it draws.
    const cvd: IndicatorDefinition = {
      ...definition,
      id: 'cvd',
      name: 'Cumulative Volume Delta',
      plots: [],
    }
    const instance = indicators.add(cvd)
    apply(instance!.instanceId, { patches: [], candles: [{
      plotId: 'cvd',
      full: true,
      from: 0,
      time: Float64Array.from([1, 2, 3]),
      open: Float64Array.from([0, 0, 0]),
      high: Float64Array.from([10, 12, 14]),
      low: Float64Array.from([-2, -1, 0]),
      close: Float64Array.from([8, 11, 13]),
      colorIndex: Uint8Array.from([0, 0, 1]),
      palette: [
        { color: '#26A69A', borderColor: '#26A69A', wickColor: '#26A69A' },
        { color: '#EF5350', borderColor: '#EF5350', wickColor: '#EF5350' },
      ],
    }] })

    expect(api.addPane).toHaveBeenCalledOnce()
    expect(panes[2].series).toHaveLength(1)
    expect(panes[2].series[0].points).toEqual([
      { time: 1, open: 0, high: 10, low: -2, close: 8, color: '#26A69A', borderColor: '#26A69A', wickColor: '#26A69A' },
      { time: 2, open: 0, high: 12, low: -1, close: 11, color: '#26A69A', borderColor: '#26A69A', wickColor: '#26A69A' },
      { time: 3, open: 0, high: 14, low: 0, close: 13, color: '#EF5350', borderColor: '#EF5350', wickColor: '#EF5350' },
    ])

    indicators.retheme('#FFFFFF')
    expect(panes[2].series[0].points[0]).toMatchObject({
      color: readableOnCached('#26A69A', '#FFFFFF'),
      borderColor: readableOnCached('#26A69A', '#FFFFFF'),
      wickColor: readableOnCached('#26A69A', '#FFFFFF'),
    })

    indicators.remove(instance!.instanceId)
    expect(api.removePane).toHaveBeenCalledWith(2)
  })

  it('mounts a candle output that only shows up after the first result', () => {
    const { chart, panes } = chartHarness()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })

    const instance = indicators.add(definition)!
    apply(instance.instanceId, { patches: patches() })
    expect(panes[2].series).toHaveLength(definition.plots.length)

    /*
     * An indicator that repaints bars on a condition sends no candle output at
     * all until the condition first occurs, so the output can arrive rounds
     * after the series were mounted.
     */
    apply(instance.instanceId, { patches: [], candles: [{
      plotId: 'repaint',
      full: true,
      from: 0,
      time: Float64Array.from([1]),
      open: Float64Array.from([1]),
      high: Float64Array.from([2]),
      low: Float64Array.from([0]),
      close: Float64Array.from([1.5]),
      colorIndex: Uint8Array.from([0]),
      palette: [
        { color: '#EF5350', borderColor: '#EF5350', wickColor: '#EF5350' },
      ],
    }] })

    expect(panes[2].series).toHaveLength(definition.plots.length + 1)
    expect(indicators.populatedPlots(instance.instanceId)).toContain('repaint')
  })

  it('anchors free-form drawings on the candle series for an overlay', () => {
    const { chart, api } = chartHarness()
    const candles = new FakeSeries()
    let apply!: IndicatorPatchHandler
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => candles as unknown as ISeriesApi<SeriesType>,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return stubClient()
      },
    })

    // The Zig Zag declares neither plots nor a pane: only shapes.
    const zigzag: IndicatorDefinition = {
      ...definition,
      id: 'zigzag',
      name: 'Zig Zag',
      overlay: true,
      plots: [],
    }
    const instance = indicators.add(zigzag)
    apply(instance!.instanceId, {
      patches: [],
      drawings: {
        lines: [{
          time1: 1, price1: 10, time2: 2, price2: 20,
          color: '#2962FF', width: 2, style: 'solid',
        }],
        boxes: [],
        labels: [{
          time: 2, price: 20, text: '20.00',
          textColor: '#FFFFFF', style: 'label_up',
        }],
        bands: [],
      },
    })

    // No pane and no series of its own: the shapes ride on the price scale.
    expect(api.addPane).not.toHaveBeenCalled()
    expect(candles.primitives).toHaveLength(1)
    expect(indicators.hasCalculated(instance!.instanceId)).toBe(true)

    const primitive = candles.primitives[0] as {
      setDrawings: (drawings: { lines: Array<{ color: string }> }) => void
    }
    const setDrawings = vi.spyOn(primitive, 'setDrawings')
    indicators.retheme('#FFFFFF')
    expect(setDrawings).toHaveBeenLastCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({
        color: readableOnCached('#2962FF', '#FFFFFF'),
      })],
    }))

    indicators.remove(instance!.instanceId)
    expect(candles.primitives).toHaveLength(0)
  })

  it('reports an indicator whose output kind the chart cannot draw', () => {
    const { chart } = chartHarness()
    let notify!: (instanceId: string, outputs: string[]) => void
    const onError = vi.fn()
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      onError,
      createClient: () => ({
        ...stubClient(),
        setNoOutputHandler: (handler: typeof notify) => {
          notify = handler
        },
      } as unknown as IndicatorClient),
    })

    const instance = indicators.add(definition)
    notify(instance!.instanceId, [])
    expect(onError.mock.calls[0][0]).toContain('não produziu valores')
    onError.mockClear()

    notify(instance!.instanceId, ['lines', 'boxes'])

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toContain('MFI/RSI Bollinger Bands')
    expect(onError.mock.calls[0][0]).toContain('linhas livres e caixas')
  })

  it('migra para painel próprio quando os pontos só chegam depois', () => {
    // Aquecimento maior que o histórico carregado: o primeiro resultado
    // desenhável traz só faixas de fundo. Criar painel para conteúdo que não
    // veio deixaria uma faixa vazia, então ele fica no painel de preço — e as
    // linhas ficavam desenhadas contra a escala de preço, onde se leem como
    // nível de preço e não são.
    const { chart, api, panes } = chartHarness()
    let apply!: IndicatorPatchHandler
    const client = stubClient()
    const indicators = useChartIndicators({
      chart: () => chart,
      candleSeries: () => null,
      bars: () => ({
        time: [], open: [], high: [], low: [], close: [], volume: [],
      }),
      createClient: (handler) => {
        apply = handler
        return client
      },
    })

    const instance = indicators.add(definition)
    // Primeiro resultado: faixas, nenhum ponto de plot.
    apply(instance!.instanceId, {
      patches: definition.plots.map((plot) => ({
        plotId: plot.id,
        full: true,
        from: 0,
        time: new Float64Array(0),
        value: new Float64Array(0),
      })),
      drawings: {
        lines: [],
        boxes: [],
        labels: [],
        bands: [{ time1: 1, time2: 2, color: '#f00' }],
      },
    })
    expect(api.addPane).not.toHaveBeenCalled()
    expect(panes[0].series.length).toBeGreaterThan(0)

    // Mais histórico chega e o indicador finalmente produz pontos.
    apply(instance!.instanceId, { patches: patches() })

    expect(api.addPane).toHaveBeenCalledOnce()
    const destino = panes[2].paneIndex()
    expect(panes[0].series.every((s) => s.movedTo === destino)).toBe(true)
  })
})
