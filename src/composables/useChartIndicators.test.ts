import { describe, expect, it, vi } from 'vitest'
import { LineStyle } from 'lightweight-charts'
import type {
  IChartApi,
  IPaneApi,
  ISeriesApi,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { IndicatorPlotPatch } from '@/domain/indicatorProtocol'
import type { IndicatorDefinition } from '@/domain/indicators'
import type {
  IndicatorClient,
  IndicatorPatchHandler,
} from '@/services/indicators'
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
  readonly priceLines: { price: number, lineStyle: number }[] = []
  readonly primitives: unknown[] = []

  attachPrimitive(primitive: unknown): void {
    this.primitives.push(primitive)
  }

  detachPrimitive(primitive: unknown): void {
    const index = this.primitives.indexOf(primitive)
    if (index >= 0) this.primitives.splice(index, 1)
  }

  createPriceLine(options: { price: number, lineStyle: number }): unknown {
    this.priceLines.push(options)
    return {}
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

  applyOptions(): void {}
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

    indicators.remove(instance!.instanceId)
    expect(api.removePane).toHaveBeenCalledWith(2)
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
})
