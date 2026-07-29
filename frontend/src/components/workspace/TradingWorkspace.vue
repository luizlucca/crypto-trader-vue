<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import AppHeader from '../layout/AppHeader.vue'
import NavigationRail from '../layout/NavigationRail.vue'
import MarketSidebar from '../market/MarketSidebar.vue'
import MarketChart from '../chart/MarketChart.vue'
import OrderBook from '../orderbook/OrderBook.vue'
import TradingTicket from '../trading/TradingTicket.vue'
import PositionsPanel from '../positions/PositionsPanel.vue'
import {
  loadSymbols,
  onStreamStatus,
  startMarketStream,
  stopMarketStream,
} from '../../services/marketData'
import type {
  Market,
  MarketSelection,
  MarketSymbol,
  StreamStatus,
} from '../../types/market'

type MarketChartExposed = { loadHistory: () => Promise<void> }

const selection = reactive<MarketSelection>({
  provider: 'binance',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  pricePrecision: 2,
  quantityPrecision: 3,
})
const chart = ref<MarketChartExposed | null>(null)
const symbols = shallowRef<MarketSymbol[]>([])
const symbolsLoading = ref(true)
const status = ref<StreamStatus['state']>('connecting')
const statusMessage = ref('')
const latency = ref(0)
const lastPrice = ref(0)
let unsubscribeStatus: (() => void) | undefined
let sessionGeneration = 0

const statusLabel = computed(() => {
  switch (status.value) {
    case 'connected':
      return 'Candles e livro conectados'
    case 'reconnecting':
      return 'Reconectando aos streams'
    case 'error':
      return 'Falha na sessão de mercado'
    default:
      return 'Conectando aos streams'
  }
})

function applySymbol(symbol: MarketSymbol): void {
  selection.symbol = symbol.symbol
  selection.baseAsset = symbol.baseAsset
  selection.quoteAsset = symbol.quoteAsset
  selection.pricePrecision = symbol.pricePrecision
  selection.quantityPrecision = symbol.quantityPrecision
}

function defaultSymbol(items: MarketSymbol[]): MarketSymbol | undefined {
  return items.find((item) => item.symbol === 'BTCUSDT') ?? items[0]
}

async function startSession(generation: number): Promise<void> {
  await nextTick()
  if (generation !== sessionGeneration) {
    return
  }

  try {
    await chart.value?.loadHistory()
    if (generation !== sessionGeneration) {
      return
    }
    await startMarketStream(selection)
  } catch (error) {
    if (generation !== sessionGeneration) {
      return
    }
    status.value = 'error'
    statusMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function restartSession(patch: Partial<MarketSelection>): Promise<void> {
  const generation = ++sessionGeneration
  status.value = 'connecting'
  statusMessage.value = ''
  lastPrice.value = 0
  latency.value = 0

  await stopMarketStream()
  if (generation !== sessionGeneration) {
    return
  }
  Object.assign(selection, patch)
  await startSession(generation)
}

async function changeMarket(market: Market): Promise<void> {
  if (market === selection.market) {
    return
  }

  const generation = ++sessionGeneration
  status.value = 'connecting'
  statusMessage.value = ''
  symbolsLoading.value = true
  symbols.value = []
  lastPrice.value = 0
  latency.value = 0

  await stopMarketStream()
  if (generation !== sessionGeneration) {
    return
  }
  selection.market = market

  try {
    const nextSymbols = await loadSymbols(selection.provider, market)
    if (generation !== sessionGeneration) {
      return
    }
    symbols.value = nextSymbols
    const nextSymbol = defaultSymbol(nextSymbols)
    if (!nextSymbol) {
      throw new Error(`Nenhum símbolo USDT disponível para ${market}`)
    }
    applySymbol(nextSymbol)
    await startSession(generation)
  } catch (error) {
    if (generation === sessionGeneration) {
      status.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (generation === sessionGeneration) {
      symbolsLoading.value = false
    }
  }
}

async function changeSymbol(symbol: MarketSymbol): Promise<void> {
  if (symbol.symbol === selection.symbol) {
    return
  }
  await restartSession({
    symbol: symbol.symbol,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    pricePrecision: symbol.pricePrecision,
    quantityPrecision: symbol.quantityPrecision,
  })
}

async function changeInterval(interval: string): Promise<void> {
  if (interval !== selection.interval) {
    await restartSession({ interval })
  }
}

async function bootstrap(): Promise<void> {
  const generation = ++sessionGeneration
  symbolsLoading.value = true
  try {
    const initialSymbols = await loadSymbols(
      selection.provider,
      selection.market,
      selection.quoteAsset,
    )
    if (generation !== sessionGeneration) {
      return
    }
    symbols.value = initialSymbols
    const initialSymbol = initialSymbols.find(
      (symbol) => symbol.symbol === selection.symbol,
    ) ?? defaultSymbol(initialSymbols)
    if (!initialSymbol) {
      throw new Error('A Binance não retornou símbolos USDT')
    }
    applySymbol(initialSymbol)
    await startSession(generation)
  } catch (error) {
    if (generation === sessionGeneration) {
      status.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (generation === sessionGeneration) {
      symbolsLoading.value = false
    }
  }
}

onMounted(() => {
  unsubscribeStatus = onStreamStatus((nextStatus) => {
    if (
      nextStatus.provider === selection.provider
      && nextStatus.market === selection.market
      && nextStatus.symbol === selection.symbol
    ) {
      status.value = nextStatus.state
      statusMessage.value = nextStatus.message ?? ''
    }
  })
  void bootstrap()
})

onBeforeUnmount(() => {
  sessionGeneration += 1
  unsubscribeStatus?.()
  void stopMarketStream()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader :selection="selection" :status="status" />
    <main class="workspace-grid">
      <NavigationRail />
      <MarketSidebar
        :connection-state="status"
        :last-price="lastPrice"
        :loading="symbolsLoading"
        :selection="selection"
        :symbols="symbols"
        @market="changeMarket"
        @symbol="changeSymbol"
      />
      <MarketChart
        ref="chart"
        :selection="selection"
        @interval="changeInterval"
        @price="lastPrice = $event"
      />
      <OrderBook
        :selection="selection"
        @latency="latency = $event"
        @price="lastPrice = $event"
      />
      <TradingTicket :selection="selection" />
      <PositionsPanel />
    </main>
    <footer class="status-bar">
      <span :class="status"><i />{{ statusLabel }}</span>
      <span>Latência: {{ latency }}ms</span>
      <span v-if="statusMessage" class="status-error">{{ statusMessage }}</span>
      <span class="status-spacer" />
      <span>
        {{ selection.provider }} · {{ selection.market }} ·
        {{ selection.symbol }} · {{ selection.interval }}
      </span>
    </footer>
  </div>
</template>
