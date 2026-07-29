<script setup lang="ts">
import type { StreamStatus } from '../../types/market'
import type { MarketSelection } from '../../types/market'

defineProps<{
  status: StreamStatus['state']
  selection: MarketSelection
}>()
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark">◆</span>
      <span>CryptoPro</span>
    </div>

    <button class="exchange-selector" type="button">
      <span>◆</span>
      Binance · {{ selection.market === 'futures' ? 'Futuros' : 'Spot' }}
      <span class="chevron">⌄</span>
    </button>

    <div class="connection" :class="status">
      <span class="connection-dot" />
      {{
        status === 'connected'
          ? 'Conectado'
          : status === 'reconnecting'
            ? 'Reconectando'
            : status === 'error'
              ? 'Erro'
              : 'Conectando'
      }}
    </div>

    <div class="ticker-strip">
      <div class="ticker">
        <span>BTC/USDT</span>
        <strong>67.842,1</strong>
        <em class="positive">+1,24%</em>
      </div>
      <div class="ticker">
        <span>ETH/USDT</span>
        <strong>3.692,14</strong>
        <em class="positive">+0,85%</em>
      </div>
      <div class="ticker">
        <span>SOL/USDT</span>
        <strong>178,21</strong>
        <em class="negative">-0,43%</em>
      </div>
    </div>

    <div class="window-actions">
      <button title="Tema" type="button">☼</button>
      <button title="Configurações" type="button">⚙</button>
      <button title="Notificações" type="button">♧</button>
      <button title="Minimizar" type="button">—</button>
      <button title="Maximizar" type="button">□</button>
      <button title="Fechar" type="button">×</button>
    </div>
  </header>
</template>
