<script setup lang="ts">
// Звезда — слой цветка из того же механизма, что сакура: круг в покое, из него раскрывается звезда, под кромкой пульта вспыхивает край. Рисует общий код `.am-bloom` из SakuraBloom.

import { starPath } from '../star'

/** Одна и та же фигура в кромке и в заливке: кромка повторяет форму, а не обводит её. */
const STAR = starPath()
</script>

<template>
  <svg class="am-bloom am-star" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <g class="am-bloom__rim">
      <path :d="STAR" />
    </g>
    <circle class="am-bloom__bud" cx="16" cy="16" r="14" />
    <g class="am-bloom__petals">
      <path :d="STAR" />
    </g>
  </svg>
</template>

<style>
/* Круг у звезды гаснет совсем, а не сжимается: у сакуры он остаётся сердцевиной цветка, а здесь
   сердцевиной будет пусто — иначе под лучами торчит круглый силуэт. Гасить приходится opacity:
   `scale(.93)` из общего кода круг уменьшает, но не убирает. Переход свой, потому что общий
   перечисляет только заливку и поворот, а без плавности круг пропадал бы рывком. */
.am-star .am-bloom__bud {
  transition:
    fill var(--am-mid) var(--am-ease),
    opacity var(--am-mid) var(--am-ease),
    transform var(--am-mid) var(--am-ease);
}

:where(button, a, [role='button']):has(> .am-bloom.am-star):hover:where(:not(.am-lite *))
  > .am-bloom
  .am-bloom__bud,
:where(button, a, [role='button']):has(> .am-bloom.am-star):focus-visible
  > .am-bloom
  .am-bloom__bud {
  opacity: 0;
}

/* Единственное правило слоя — цвет свечения: у звезды он тоном балла, а не розовым сакуры,
   потому что правило цветка общее для всех `.am-bloom`. Селектор с `:has(> .am-bloom.am-star)`
   перевешивает правило сакуры по весу. */
:where(button, a, [role='button']):has(> .am-bloom.am-star):hover:where(:not(.am-lite *))
  > .am-bloom,
:where(button, a, [role='button']):has(> .am-bloom.am-star):focus-visible > .am-bloom {
  filter: drop-shadow(var(--am-bloom-shade, 0 2px 5px var(--am-veil)))
    drop-shadow(0 0 9px color-mix(in srgb, var(--am-mark, var(--am-accent)) 50%, transparent));
}
</style>
