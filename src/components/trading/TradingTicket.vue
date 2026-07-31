<script setup lang="ts">
import type { MarketSelection } from '@shared/types/market'

defineProps<{ selection: MarketSelection }>()
</script>

<template>
  <aside class="trading-ticket panel">
    <header class="panel-header">
      <h2>BOLETA</h2>
      <button type="button">⌃</button>
    </header>
    <div class="ticket-tabs">
      <button class="active" type="button">Limit</button>
      <button type="button">Market</button>
      <button type="button">Stop Limit</button>
    </div>
    <div class="side-buttons">
      <button class="buy" type="button">Comprar / Long</button>
      <button class="sell" type="button">Vender / Short</button>
    </div>

    <div class="balance-row"><span>Disponível</span><strong>2.487,35 USDT</strong></div>
    <label class="ticket-field">
      <span>Preço</span>
      <div><input value="66.500,0"><small>{{ selection.quoteAsset }}</small></div>
    </label>
    <label class="ticket-field">
      <span>Quantidade</span>
      <div><input value="0,050"><small>{{ selection.baseAsset }}</small></div>
    </label>

    <div class="leverage">
      <div><span>Alavancagem</span><strong>10x</strong></div>
      <input aria-label="Alavancagem" max="100" min="1" type="range" value="10">
      <div class="leverage-labels"><span>1x</span><span>5x</span><span>10x</span><span>25x</span><span>100x</span></div>
    </div>

    <label class="check-row"><input checked type="checkbox"> TP/SL</label>
    <span class="field-caption">Predefinições (TP / SL)</span>
    <div class="preset-grid">
      <button class="moderate" type="button"><strong>Moderado</strong><span>TP 0,50%</span><span>SL 0,25%</span></button>
      <button class="neutral active" type="button"><strong>Neutro</strong><span>TP 1,00%</span><span>SL 0,50%</span></button>
      <button class="aggressive" type="button"><strong>Agressivo</strong><span>TP 2,00%</span><span>SL 1,00%</span></button>
    </div>

    <div class="estimate-fields">
      <label><span>TP</span><input value="67.500,0"></label>
      <strong class="positive">+66,25 USDT<br><small>(+1,99%)</small></strong>
      <label><span>SL</span><input value="65.800,0"></label>
      <strong class="negative">-33,25 USDT<br><small>(-1,00%)</small></strong>
    </div>

    <div class="ticket-summary">
      <div><span>Break Even (Est.)</span><strong>67.100,0 USDT</strong></div>
      <div><span>Margem (Est.)</span><strong>332,50 USDT</strong></div>
      <div><span>P/L Estimado</span><strong class="positive">+66,05 USDT (+1,99%)</strong></div>
    </div>
    <button class="submit-order" type="button">
      Comprar / Long <span>0,050 {{ selection.baseAsset }}</span>
    </button>
    <div class="cost-row">
      <span>Custo: 3,32 {{ selection.quoteAsset }}</span>
      <span>Máx.: 0,372 {{ selection.baseAsset }}</span>
    </div>
  </aside>
</template>
