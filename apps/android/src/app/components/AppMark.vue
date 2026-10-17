<script setup lang="ts">
// Знак приложения в рельсе: та же картинка, что иконкой окна (src-tauri/icons/128x128.png).
// Взят 128×128, а не icon.png: в рельсе знак 34 px. Прозрачный: форму держит обводка (тёмная тема) или тёмный лепесток (светлая).

import markSrc from '../../../src-tauri/icons/128x128.png'
</script>

<template>
  <!-- alt пустой: рядом в рельсе название программы текстом.
       draggable="false": иначе знак таскается мышью, как любая картинка в браузере — в окне приложения это выглядит поломкой. -->
  <img class="am-mark" :src="markSrc" alt="" draggable="false" />
</template>

<style scoped>
/* Ширины и высоты нет сознательно: их задаёт тот, кто ставит знак, и свой размер перебивал бы его класс. */
.am-mark {
  display: block;
  flex: none;
  object-fit: contain;
}
</style>
