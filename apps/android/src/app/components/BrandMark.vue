<script setup lang="ts">
// Знак сервиса: плита фирменного цвета и вектор из src/app/brand (simple-icons CC0, lucide
// ISC, либо растр внутри файла). SVG, а не PNG: знак живёт на 24-28 px и дробном масштабе.

import { computed } from 'vue'

import anilistGlyph from '../brand/anilist.svg?raw'
import malGlyph from '../brand/myanimelist.svg?raw'
import shikimoriGlyph from '../brand/shikimori.svg?raw'
import spotifyGlyph from '../brand/spotify.svg?raw'
import yandexDiskGlyph from '../brand/yandex-disk.svg?raw'
import yandexMusicGlyph from '../brand/yandex-music.svg?raw'
import youtubeMusicGlyph from '../brand/youtube-music.svg?raw'

type BrandName =
  | 'anilist'
  | 'shikimori'
  | 'myanimelist'
  | 'yandex-disk'
  | 'spotify'
  | 'youtube-music'
  | 'yandex-music'

type Brand = {
  /** Содержимое файла знака; вставляется в разметку как есть. */
  glyph: string
  /** Плита под знаком — фирменный цвет сервиса. */
  plate: string
  ink: string
  /** Доля плиты под знак: оптический размер у знаков разный — плотная «AL» требует полей больше. */
  size: string
  /** Знак нарисован штрихом, а не заливкой. */
  stroke?: boolean
  /** Перекрашивать ли знак в ink: у одноцветных да, у цветных логотипов нет.
   * Флаг задан явно, а не выведен из содержимого: угадывать по <image> значило бы сломаться на MAL. */
  tint?: boolean
  /** Знак круглый и обрезается по кругу, а не по скруглённому квадрату: у логотипов
   * стримингов круг входит в сам знак, и белые углы картинки срезает обрезка. */
  round?: boolean
}

const BRANDS: Record<BrandName, Brand> = {
  anilist: {
    glyph: anilistGlyph,
    plate: '#02a9ff',
    ink: '#ffffff',
    size: '58%',
    tint: true,
  },
  shikimori: {
    glyph: shikimoriGlyph,
    plate: '#aad3e7',
    ink: '#16202c',
    size: '78%',
    tint: true,
  },
  // Надпись широкая и низкая: поля ей нужны меньше остальных, иначе буквы садятся
  // в середину плиты строчкой в пиксель высотой. Цвет держит сама картинка.
  myanimelist: {
    glyph: malGlyph,
    plate: '#2e51a2',
    ink: '#ffffff',
    size: '78%',
  },
  'yandex-disk': {
    glyph: yandexDiskGlyph,
    plate: '#fc3f1d',
    ink: '#ffffff',
    size: '64%',
    stroke: true,
    tint: true,
  },
  // Стриминги: круг входит в сам знак — плита прозрачная, знак занимает всю площадь без полей.
  spotify: {
    glyph: spotifyGlyph,
    plate: 'transparent',
    ink: '#1db954',
    size: '100%',
    round: true,
  },
  'youtube-music': {
    glyph: youtubeMusicGlyph,
    plate: 'transparent',
    ink: '#ff0000',
    size: '100%',
    round: true,
  },
  'yandex-music': {
    glyph: yandexMusicGlyph,
    plate: 'transparent',
    ink: '#ffcc00',
    size: '100%',
    round: true,
  },
}

const props = defineProps<{ name: BrandName }>()

const brand = computed<Brand>(() => BRANDS[props.name])
</script>

<template>
  <!-- aria-hidden: название сервиса стоит текстом рядом, знак второй раз его не проговаривает. -->
  <span
    class="am-brand"
    :class="{
      'am-brand--stroke': brand.stroke === true,
      'am-brand--tint': brand.tint === true,
      'am-brand--round': brand.round === true,
    }"
    :style="{
      '--am-brand-plate': brand.plate,
      '--am-brand-ink': brand.ink,
      '--am-brand-size': brand.size,
    }"
    aria-hidden="true"
    v-html="brand.glyph"
  />
</template>

<style scoped>
/* Размер приходит снаружи (в панели импорта 28 px, в строке облака 24); здесь форма, цвет и центровка.
   overflow: hidden обязателен: знаки нарисованы во всю ширину квадрата и без обрезки вылезали бы за скругление. */
.am-brand {
  display: grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  color: var(--am-brand-ink);
  background: var(--am-brand-plate);
  border-radius: 26%;
}

/* :deep обязателен: вектор встроен через v-html и метки области видимости не получает. */
.am-brand :deep(svg) {
  display: block;
  width: var(--am-brand-size);
  height: var(--am-brand-size);
}

/* Одноцветные векторы красятся в ink; цветные логотипы — нет, иначе заливка съедает фирменные цвета. */
.am-brand--tint :deep(svg) {
  fill: currentColor;
}

/* Штриховой знак заливать нельзя: заливка слепила бы контур в пятно. */
.am-brand--stroke :deep(svg) {
  fill: none;
  stroke: currentColor;
}

/* Круглый знак: обрезка по кругу срезает белые углы картинки. */
.am-brand--round {
  border-radius: 50%;
}
</style>
