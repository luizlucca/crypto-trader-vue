<script setup lang="ts">
import {
  ChartSpline,
  Eye,
  MousePointer2,
  PenTool,
  Ruler,
  Shapes,
  Trash2,
  TrendingUp,
  Type as TextIcon,
} from '@lucide/vue'
</script>

<template>
  <div class="drawing-toolbar" aria-label="Ferramentas de desenho">
    <button aria-label="Cursor" class="active" title="Cursor" type="button">
      <MousePointer2 aria-hidden="true" />
    </button>
    <button aria-label="Linha de tendência" title="Linha de tendência" type="button">
      <TrendingUp aria-hidden="true" />
    </button>
    <button aria-label="Fibonacci" title="Fibonacci" type="button">
      <ChartSpline aria-hidden="true" />
    </button>
    <button aria-label="Pincel" title="Pincel" type="button">
      <PenTool aria-hidden="true" />
    </button>
    <button aria-label="Texto" title="Texto" type="button">
      <TextIcon aria-hidden="true" />
    </button>
    <button aria-label="Formas" title="Formas" type="button">
      <Shapes aria-hidden="true" />
    </button>
    <button aria-label="Régua" title="Régua" type="button">
      <Ruler aria-hidden="true" />
    </button>
    <span />
    <button aria-label="Mostrar desenhos" title="Mostrar desenhos" type="button">
      <Eye aria-hidden="true" />
    </button>
    <button aria-label="Excluir" title="Excluir" type="button">
      <Trash2 aria-hidden="true" />
    </button>
  </div>
</template>
