// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type {
  MarketCatalog,
  MarketEnvironment,
  MarketSelection,
  MarketSymbol,
} from '@shared/types/market'
import { useWorkspaceTabs, type WorkspaceTabsController } from
  './useWorkspaceTabs'

const mocks = vi.hoisted(() => ({
  startMarketStream: vi.fn(
    async (_sessionId: string, _selection: unknown) => {},
  ),
  stopMarketStream: vi.fn(async (_sessionId: string) => {}),
  updateMarketCandleStream: vi.fn(async () => {}),
  setMarketStreamVisibility: vi.fn(async () => {}),
  setMarketOrderBookAggregation: vi.fn(async () => {}),
  onStreamStatus: vi.fn(() => () => {}),
  onCandle: vi.fn(() => () => {}),
  dropIndicatorLayout: vi.fn(),
  resetStreamLatency: vi.fn(),
}))

vi.mock('@desktop/marketData', () => ({
  startMarketStream: mocks.startMarketStream,
  stopMarketStream: mocks.stopMarketStream,
  updateMarketCandleStream: mocks.updateMarketCandleStream,
  setMarketStreamVisibility: mocks.setMarketStreamVisibility,
  setMarketOrderBookAggregation: mocks.setMarketOrderBookAggregation,
  onStreamStatus: mocks.onStreamStatus,
  onCandle: mocks.onCandle,
}))

vi.mock('@indicators/services/indicatorLayout', () => ({
  dropIndicatorLayout: mocks.dropIndicatorLayout,
}))

vi.mock('@market/services/streamLatency', () => ({
  resetStreamLatency: mocks.resetStreamLatency,
}))

function catalogFor(
  environment: MarketEnvironment,
  symbols: string[],
): MarketCatalog {
  return {
    provider: 'binance',
    environment,
    market: 'futures',
    quoteAsset: '',
    items: symbols.map((symbol) => ({
      provider: 'binance',
      market: 'futures' as const,
      symbol,
      baseAsset: symbol.replace('USDT', ''),
      quoteAsset: 'USDT',
      status: 'TRADING',
      priceTickSize: 0.1,
      pricePrecision: 1,
      quantityPrecision: 3,
      lastPrice: 1,
      priceChange: 0,
      priceChangePercent: 0,
      weightedAveragePrice: 1,
      openPrice: 1,
      highPrice: 1,
      lowPrice: 1,
      volume: 1,
      quoteVolume: 1,
      tradeCount: 1,
    })),
    loadedAt: 0,
    expiresAt: Number.MAX_SAFE_INTEGER,
    cached: false,
    stale: false,
  }
}

const ethereum: MarketSymbol = {
  provider: 'binance',
  market: 'futures',
  symbol: 'ETHUSDT',
  baseAsset: 'ETH',
  quoteAsset: 'USDT',
  status: 'TRADING',
  priceTickSize: 0.1,
  pricePrecision: 1,
  quantityPrecision: 3,
}

/** Serves whatever the requested environment lists, like the real one does. */
function ensureCatalog(scope: MarketSelection): Promise<MarketCatalog> {
  return Promise.resolve(scope.environment === 'test'
    ? catalogFor('test', ['BTCUSDT'])
    : catalogFor('live', ['BTCUSDT', 'ETHUSDT']))
}

async function mountWorkspace(
  catalog: (scope: MarketSelection) => Promise<MarketCatalog> = ensureCatalog,
): Promise<{
  workspace: WorkspaceTabsController
  unmount: () => void
}> {
  let workspace!: WorkspaceTabsController
  const wrapper = mount(defineComponent({
    setup() {
      workspace = useWorkspaceTabs({ ensureCatalog: catalog })
      return () => h('div')
    },
  }))
  await flushPromises()
  return { workspace, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('workspace reset on environment switch', () => {
  it('replaces every open tab with one fresh tab on the new venue',
    async () => {
      const { workspace, unmount } = await mountWorkspace()
      workspace.openInNewTab(ethereum)
      workspace.openInNewTab(ethereum)
      await flushPromises()
      expect(workspace.tabs).toHaveLength(3)
      const discardedIds = workspace.tabs.map((tab) => tab.id)

      await workspace.resetTo('test')

      expect(workspace.tabs).toHaveLength(1)
      expect(workspace.selection.value.environment).toBe('test')
      expect(discardedIds).not.toContain(workspace.tabs[0].id)
      expect(workspace.activeTabId.value).toBe(workspace.tabs[0].id)
      unmount()
    })

  it('takes the same path for a single tab, with no shortcut', async () => {
    const { workspace, unmount } = await mountWorkspace()
    const originalId = workspace.tabs[0].id

    await workspace.resetTo('test')

    expect(workspace.tabs).toHaveLength(1)
    expect(workspace.tabs[0].id).not.toBe(originalId)
    expect(mocks.stopMarketStream).toHaveBeenCalledWith(originalId)
    unmount()
  })

  /*
   * Every tab must undo its own subscriptions. A stream left running in the
   * utility process would keep the old venue's socket open forever, invisible
   * from the interface.
   */
  it('stops exactly the streams it opened, leaving none orphaned',
    async () => {
      const { workspace, unmount } = await mountWorkspace()
      workspace.openInNewTab(ethereum)
      await flushPromises()
      const openedIds = workspace.tabs.map((tab) => tab.id)
      mocks.stopMarketStream.mockClear()

      await workspace.resetTo('test')

      const stopped = mocks.stopMarketStream.mock.calls.map(([id]) => id)
      expect([...stopped].sort()).toEqual([...openedIds].sort())
      unmount()
    })

  it('drops the per-tab latency and indicator state of every closed tab',
    async () => {
      const { workspace, unmount } = await mountWorkspace()
      const closedId = workspace.tabs[0].id
      mocks.dropIndicatorLayout.mockClear()
      mocks.resetStreamLatency.mockClear()

      await workspace.resetTo('test')

      expect(mocks.dropIndicatorLayout).toHaveBeenCalledWith(closedId)
      expect(mocks.resetStreamLatency).toHaveBeenCalledWith(closedId)
      unmount()
    })

  it('opens the new session against the new environment', async () => {
    const { workspace, unmount } = await mountWorkspace()
    mocks.startMarketStream.mockClear()

    await workspace.resetTo('test')

    const [, selection] = mocks.startMarketStream.mock.calls.at(-1) as
      unknown as [string, MarketSelection]
    expect(selection.environment).toBe('test')
    unmount()
  })

  it('lists the pairs of the environment it switched to', async () => {
    const { workspace, unmount } = await mountWorkspace()

    await workspace.resetTo('test')

    // The testnet catalog has one pair; production has two. Serving the
    // production list here would mean the cache ignored the environment.
    expect(workspace.selection.value.symbol).toBe('BTCUSDT')
    expect(workspace.selection.value.environment).toBe('test')
    unmount()
  })

  /*
   * A catalog requested before the switch can resolve after it. The generation
   * guard already exists for pair changes; this proves it also covers a venue
   * change, where a late answer would look like perfectly valid data.
   */
  it('discards a catalog that resolves after the reset', async () => {
    let releaseStale: (catalog: MarketCatalog) => void = () => {}
    let call = 0
    const catalog = (scope: MarketSelection): Promise<MarketCatalog> => {
      call += 1
      if (call === 1) {
        return new Promise((resolve) => {
          releaseStale = resolve
        })
      }
      return ensureCatalog(scope)
    }
    const { workspace, unmount } = await mountWorkspace(catalog)

    await workspace.resetTo('test')
    releaseStale(catalogFor('live', ['ETHUSDT']))
    await flushPromises()

    expect(workspace.selection.value.environment).toBe('test')
    expect(workspace.selection.value.symbol).toBe('BTCUSDT')
    unmount()
  })

  it('survives a stream that refuses to stop', async () => {
    mocks.stopMarketStream.mockRejectedValueOnce(new Error('socket travado'))
    const { workspace, unmount } = await mountWorkspace()

    await expect(workspace.resetTo('test')).resolves.toBeUndefined()

    expect(workspace.tabs).toHaveLength(1)
    expect(workspace.selection.value.environment).toBe('test')
    unmount()
  })

  it('ends on the second venue when two switches run back to back',
    async () => {
      const { workspace, unmount } = await mountWorkspace()

      await workspace.resetTo('test')
      await workspace.resetTo('live')

      expect(workspace.tabs).toHaveLength(1)
      expect(workspace.selection.value.environment).toBe('live')
      unmount()
    })

  /*
   * `activeTab` is typed as always present. If the list were emptied before
   * the replacement went in, any read during that window would be a lie the
   * type system cannot catch.
   */
  it('never leaves the tab list empty', async () => {
    const { workspace, unmount } = await mountWorkspace()
    const seen: number[] = []
    const reset = workspace.resetTo('test')
    seen.push(workspace.tabs.length)
    await reset
    seen.push(workspace.tabs.length)

    expect(seen.every((count) => count >= 1)).toBe(true)
    unmount()
  })
})
