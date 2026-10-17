<script setup lang="ts">
// Значки пунктов рельса: нарисованы, а не набраны знаками Юникода — у тех своя величина и толщина.
// Правило: вектор в клетке 20×20, одна толщина линии, цвет по тексту. Исключение — «Обновить».

import type { MenuIcon } from '../router/routes'

/// Имена значков: пункты меню (их имена живут в маршрутах, чтобы у пункта
/// не было значка, которого нет в рисунке) и служебные действия рельса.
type Kind = MenuIcon | 'back' | 'reload' | 'update'

const props = defineProps<{ name: Kind }>()
</script>

<template>
  <!-- «Обновить» — знаком, а не вектором: почему — в шапке файла. -->
  <span v-if="props.name === 'reload'" class="am-railicon-utf" aria-hidden="true">⟳</span>

  <svg
    v-else
    class="am-railicon"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="props.name === 'home'">
      <path d="M2.8 9.4 10 3.4l7.2 6" />
      <path d="M5 8.2v8.2h10V8.2" />
    </template>

    <template v-else-if="props.name === 'lists'">
      <path d="M3.4 6h13.2" />
      <path d="M3.4 10h13.2" />
      <path d="M3.4 14h13.2" />
    </template>

    <template v-else-if="props.name === 'history'">
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 6.2V10l2.9 1.9" />
    </template>

    <template v-else-if="props.name === 'search'">
      <circle cx="8.8" cy="8.8" r="4.9" />
      <path d="M12.4 12.4 16.8 16.8" />
    </template>

    <!-- Настройки: шестерня о восьми зубьях и своя втулка. Восемь, а не шесть: на двадцати пикселях шесть походят на штурвал. -->
    <template v-else-if="props.name === 'settings'">
      <path
        d="M8.20 4.91 L8.46 2.76 L11.54 2.76 L11.80 4.91 L12.32 5.13 L14.03 3.79
           L16.21 5.97 L14.87 7.68 L15.09 8.20 L17.24 8.46 L17.24 11.54 L15.09 11.80
           L14.87 12.32 L16.21 14.03 L14.03 16.21 L12.32 14.87 L11.80 15.09 L11.54 17.24
           L8.46 17.24 L8.20 15.09 L7.68 14.87 L5.97 16.21 L3.79 14.03 L5.13 12.32
           L4.91 11.80 L2.76 11.54 L2.76 8.46 L4.91 8.20 L5.13 7.68 L3.79 5.97
           L5.97 3.79 L7.68 5.13 Z"
      />
      <circle cx="10" cy="10" r="2.6" />
    </template>

    <template v-else-if="props.name === 'back'">
      <path d="M12.4 5 6.8 10l5.6 5" />
    </template>

    <!-- Обновление: стрелка в лоток. От «Обновить» (⟳) знак отличается направлением:
         одно перезапускает окно, другое приносит новую версию. -->
    <template v-else-if="props.name === 'update'">
      <path d="M10 3.2v8.6" />
      <path d="M6.6 8.6 10 12l3.4-3.4" />
      <path d="M3.8 13.4v3.2h12.4v-3.2" />
    </template>
  </svg>
</template>

<style scoped>
/* Размер задаёт тот, кто ставит значок (в рельсе — .am-side__icon); здесь только то, без чего вектор ломает строку. */
.am-railicon {
  display: block;
  width: 100%;
  height: 100%;
}

/* Кегль знака ⟳ больше клетки: начертание занимает ~0.6 кегля, и на 22 px чернила выходят 14×13,
   как у соседних векторов. line-height: 1 — иначе межстрочный просвет уводит знак с середины клетки. */
.am-railicon-utf {
  font-size: 22px;
  line-height: 1;
}
</style>
