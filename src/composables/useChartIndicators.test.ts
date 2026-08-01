import { describe, expect, it, vi } from 'vitest'
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
    addSeries: vi.fn(),
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
  return { chart: chart as unknown as IChartApi, panes, api: chart }
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
    const client = {
      attach: vi.fn(),
      compute: vi.fn(),
      detach: vi.fn(),
      setErrorHandler: vi.fn(),
      dispose: vi.fn(),
    } as unknown as IndicatorClient
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

    apply(instance!.instanceId, patches())

    expect(api.addPane).toHaveBeenCalledOnce()
    expect(panes).toHaveLength(3)
    expect(panes[2].series).toHaveLength(4)
    expect(panes[2].series.every((series) => series.points.length === 3)).toBe(true)

    indicators.remove(instance!.instanceId)
    expect(api.removeSeries).toHaveBeenCalledTimes(4)
    expect(api.removePane).toHaveBeenCalledWith(2)
    expect(panes).toHaveLength(2)
  })
})
