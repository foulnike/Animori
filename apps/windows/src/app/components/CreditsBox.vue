<script setup lang="ts">
import { ref } from 'vue'

import { Bridge } from '@/bridge'

import { DOCUMENTS } from '../../../../../packages/onboarding/src/legal'

/** Развёрнут ли список. По умолчанию нет: панель открывают за версией и датсетом, а не за этим. */
const open = ref(false)

/** Список источников. Порядок — по роли в программе: сперва то, что стоит на каждой карточке. */
const SOURCES = [
  { name: 'AniList', what: 'каталог, списки, расписание', url: 'https://anilist.co' },
  {
    name: 'Шикимори',
    what: 'русские названия, описания, персонажи и авторы',
    url: 'https://shikimori.one',
  },
  { name: 'AnimeThemes', what: 'опенинги и эндинги', url: 'https://animethemes.moe' },
  { name: 'Kodik · Anilibria', what: 'ссылки на видео', url: '' },
  {
    name: 'animori-data',
    what: 'датасет названий, CC0-1.0',
    url: 'https://github.com/foulnike/animori-data',
  },
] as const

/** Открыть адрес источника. У Kodik и Anilibria адреса нет: это названия сервисов, а не адреса,
 *  по которым программа ходит, и ссылка смотрелась бы обещанием, которого нет. */
function onSource(url: string): void {
  if (url === '') return
  void Bridge.shell.openExternal(url)
}
</script>

<template>
  <section class="am-credits">
    <!-- Шапка — кнопка: список сворачивается, а счётчик в ней виден и свёрнутым, иначе блок
         выглядит пустым и его не ищут. -->
    <button class="am-credits__head" type="button" :aria-expanded="open" @click="open = !open">
      <svg
        class="am-credits__icon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 2.5v15m-4 0h8M5 5h10M5 5l-3 7h6L5 5Zm10 0-3 7h6l-3-7ZM2 12a3 3 0 0 0 6 0m4 0a3 3 0 0 0 6 0"
        />
      </svg>
      <span class="am-credits__title">Источники и права</span>
      <span class="am-credits__count">{{ SOURCES.length }}</span>
      <svg class="am-credits__caret" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4 6.5 8 10.5 12 6.5" />
      </svg>
    </button>

    <div v-if="open" class="am-credits__body">
      <ul class="am-credits__list">
        <li v-for="source in SOURCES" :key="source.name" class="am-credits__row">
          <button
            v-if="source.url !== ''"
            class="am-chip am-credits__chip"
            type="button"
            @click="onSource(source.url)"
          >
            {{ source.name }}
          </button>
          <span v-else class="am-chip am-credits__chip am-credits__chip--off">{{
            source.name
          }}</span>
          <span class="am-credits__what">{{ source.what }}</span>
        </li>
      </ul>

      <div class="am-credits__rights">
        <h4>Права и лицензии</h4>
        <p>
          Сведения об авторах описаний указаны на страницах источников. Лицензии зависимостей
          перечислены в THIRD-PARTY.md.
        </p>
      </div>

      <!-- Правовые документы: полные тексты живут в репозитории, здесь — только вход к ним. -->
      <ul class="am-credits__list am-credits__docs">
        <li v-for="doc in DOCUMENTS" :key="doc.url" class="am-credits__row">
          <button class="am-chip am-credits__chip" type="button" @click="onSource(doc.url)">
            {{ doc.title }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
<style scoped>
.am-credits {
  margin-top: 16px;
  border-top: 1px solid var(--am-line-soft);
}

/* Шапка на всю ширину: блок выглядит строкой настроек, а не заколотым текстом. Собственная рамка
   не нужна — снизу линия разделителя уже есть. */
.am-credits__head {
  display: flex;
  gap: 9px;
  align-items: center;
  width: 100%;
  padding: 12px 2px;
  font: inherit;
  color: var(--am-text);
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition: color var(--am-fast) var(--am-ease);
}

.am-credits__head:hover {
  color: var(--am-accent);
}

.am-credits__icon {
  flex: none;
  width: 16px;
  height: 16px;
}

.am-credits__title {
  flex: 1 1 auto;
  font-size: 12.5px;
  font-weight: 600;
}

/* Счётчик — тем же приёмом, что и год на карточке: число рядом со словом читается быстрее. */
.am-credits__count {
  padding: 1px 7px;
  font-size: 11px;
  color: var(--am-faint);
  background: var(--am-fill-1);
  border-radius: 999px;
}

/* Стрелка разворота. Поворот на самом SVG: смена transform на кнопке тянула бы за собой
   весь блок вместе с рамкой. */
.am-credits__caret {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--am-fast) var(--am-ease);
}

.am-credits__head[aria-expanded='true'] .am-credits__caret {
  transform: rotate(180deg);
}

.am-credits__body {
  padding-bottom: 4px;
}

.am-credits__list {
  display: grid;
  gap: 7px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

/* Строка источника: чип слева, назначение справа. Смысл в том, чтобы чип читался как кнопка
   с первого взгляда, — иначе он сливается со строкой описания. */
.am-credits__row {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.am-credits__chip {
  flex: none;
}

/* У источников без адреса чип остаётся на месте, но гаснет: кликнуть его нельзя, и видеть это
   лучше тихо, чем второй раз нажимать. */
.am-credits__chip--off {
  color: var(--am-faint);
  cursor: default;
  background: none;
  border-style: dashed;
}

.am-credits__chip--off:hover {
  color: var(--am-faint);
  background: none;
}

.am-credits__what {
  font-size: 12px;
  line-height: 1.5;
  color: var(--am-dim);
}

.am-credits__rights {
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--am-dim);
}

.am-credits__rights h4 {
  margin: 0 0 4px;
  font-size: inherit;
  color: var(--am-text);
}

.am-credits__rights p {
  margin: 0;
}

.am-credits__docs {
  margin-top: 10px;
}
</style>
