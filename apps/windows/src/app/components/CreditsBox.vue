<script setup lang="ts">
// Источники и права: сервисы, на каких условиях программа их показывает. Отдельно от фактов
// «О программе», в одной модалке; список свёрнут, оговорки под ним.

import { ref } from 'vue'

import { Bridge } from '@/bridge'

/** Развёрнут ли список. По умолчанию нет: панель открывают за версией и датсетом, а не за этим. */
const open = ref(false)

/** Список источников. Порядок — по роли в программе: сперва то, что стоит на каждой карточке. */
const SOURCES = [
  { name: 'AniList', what: 'каталог, списки, расписание', url: 'https://anilist.co' },
  {
    name: 'Шикимори',
    what: 'русские названия, описания, персонажи',
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

/** Адреса правовых документов. Один источник правды — файлы в репозитории. */
const PRIVACY_URL = 'https://github.com/foulnike/Animori/blob/main/docs/PRIVACY.md'
const TERMS_URL = 'https://github.com/foulnike/Animori/blob/main/docs/TERMS.md'
const DOCS = [
  { name: 'Политика обработки персональных данных', url: PRIVACY_URL },
  { name: 'Условия использования', url: TERMS_URL },
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

      <!-- Оговорки. Язык сухой и юридический не случайно: этот текст читают вслух при разборе,
           и мягкие формулировки там не помогают. -->
      <ul class="am-credits__terms">
        <li>
          Наименования, описания и иные тексты принадлежат своим авторам и воспроизводятся со
          ссылкой на источник. Сведения об авторе описания публикуются на странице источника.
        </li>
        <li>
          Видеоматериал предоставляется сторонними сервисами, не связанными с AniMori и не
          являющимися правообладателями: лицензий на него программа не получает, не размещает, не
          хранит и не копирует его и прав на распространение не имеет.
        </li>
        <li>
          Источники программой не проверяются: законность, содержимое и доступность не
          гарантируются. Плеер лишь открывает адрес потока выбранного человека — за выбор источника,
          за просмотр и за его законность в своей юрисдикции отвечает пользователь.
        </li>
        <li>
          Материалы возрастного ограничения по умолчанию скрыты; их отображение включается
          настройкой «Взрослое содержимое».
        </li>
        <li>
          AniMori не является продуктом AniList, не связан с ним и не одобрен им. Пользовательские
          списки хранятся на устройстве и в AniList не передаются.
        </li>
        <li>
          Код распространяется по лицензии MIT, перечень зависимостей и их лицензий приведён в
          THIRD-PARTY.md. Данные датасета animori-data публикуются по CC0-1.0.
        </li>
      </ul>

      <!-- Правовые документы: полные тексты живут в репозитории, здесь — только вход к ним. -->
      <ul class="am-credits__list am-credits__docs">
        <li v-for="doc in DOCS" :key="doc.url" class="am-credits__row">
          <button class="am-chip am-credits__chip" type="button" @click="onSource(doc.url)">
            {{ doc.name }}
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

/* Оговорки — маркированным списком, а не абзацами: их читают по одной, и список даёт глазу
   пять зацепок вместо сплошной стены. */
.am-credits__terms {
  display: grid;
  gap: 5px;
  margin: 14px 0 0;
  padding-left: 16px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--am-faint);
}

.am-credits__terms li::marker {
  color: var(--am-line);
}

/* Правовые документы — отдельным списком под оговорками: вход к полным текстам,
   а не ещё одна оговорка. */
.am-credits__docs {
  margin-top: 10px;
}
</style>
