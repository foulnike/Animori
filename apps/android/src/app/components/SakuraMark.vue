<script setup lang="ts">
// Малая сакура: тот же лепесток, что у SakuraBloom, но знаком в строке. Без сердцевины:
// круг прятал бы пустоту кнопки. viewBox с отступом (36.2): лепестки выходят за квадрат 32, а знаку выступать нельзя.

import { SAKURA_PETAL, SAKURA_TURNS, sakuraTurnMark } from '../sakura'
</script>

<template>
  <svg class="am-sakura" viewBox="-2.1 -2.1 36.2 36.2" aria-hidden="true" focusable="false">
    <path
      v-for="turn in SAKURA_TURNS"
      :key="turn"
      :d="SAKURA_PETAL"
      :transform="sakuraTurnMark(turn)"
    />
  </svg>
</template>

<!-- Стили без scoped: префикс am-sakura свой, правил немного, а scoped добавил бы хеш без пользы. -->
<style>
/* Размер задаёт ставящий знак через --am-sakura-size: без него знак растягивается во весь блок.
   По умолчанию 1em — знак соразмерен кеглю текста рядом. */
.am-sakura {
  display: block;
  flex: none;
  width: var(--am-sakura-size, 1em);
  height: var(--am-sakura-size, 1em);
  fill: currentcolor;
}
</style>
