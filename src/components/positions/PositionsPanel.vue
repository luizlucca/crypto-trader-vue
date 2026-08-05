<script setup lang="ts">
/**
 * Scaffolding, not a feature. These two positions are hardcoded and the close
 * buttons do nothing: there is no account path behind them yet. Stated here
 * because it reads as working software on screen.
 */
const positions = [
  ['BTC/USDT', 'Long', '0,050 BTC', '66.500,0', '67.842,1', '10x', '332,50', '+66,05', '+1,99%', true],
  ['ETH/USDT', 'Long', '0,500 ETH', '3.550,00', '3.692,14', '10x', '177,50', '+71,31', '+4,01%', true],
]
</script>

<template>
  <section class="positions-panel panel">
    <header class="positions-tabs">
      <button class="active" type="button">POSIÇÕES (2)</button>
      <button type="button">ORDENS ABERTAS (1)</button>
      <button type="button">HISTÓRICO DE ORDENS</button>
      <button type="button">HISTÓRICO DE TRADES</button>
      <span />
      <button type="button">Fechar todas as posições</button>
    </header>
    <div class="positions-table positions-head">
      <span>Símbolo</span><span>Lado</span><span>Tamanho</span>
      <span>Preço de entrada</span><span>Preço marca</span><span>Alav.</span>
      <span>Margem (USDT)</span><span>P/L não realizado</span><span>P/L (%)</span><span>Ação</span>
    </div>
    <div v-for="position in positions" :key="position[0] as string" class="positions-table position-row">
      <strong>{{ position[0] }}</strong>
      <span class="positive">{{ position[1] }}</span>
      <span>{{ position[2] }}</span>
      <span>{{ position[3] }}</span>
      <span>{{ position[4] }}</span>
      <span>{{ position[5] }}</span>
      <span>{{ position[6] }}</span>
      <span class="positive">{{ position[7] }}</span>
      <span class="positive">{{ position[8] }}</span>
      <button type="button">Fechar</button>
    </div>
  </section>
</template>
