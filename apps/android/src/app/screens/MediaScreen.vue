<script setup lang="ts">
// Карточка аниме. Состояние списка берётся из памяти — она свежее чужого ответа. Данные в media-card.ts, оформление в media-screen.css. Плиток на доске три, любая может не прийти.

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AboutBox from '../components/AboutBox.vue'
import BrandMark from '../components/BrandMark.vue'
import EmptyMark from '../components/EmptyMark.vue'
import EntrySheet from '../components/EntrySheet.vue'
import PeopleBox from '../components/PeopleBox.vue'
import RichText from '../components/RichText.vue'
import ShotBox from '../components/ShotBox.vue'
import { genreWord } from '../labels'
import { isWeakPlatform } from '../platform'
import { currentRoute, navigate } from '../router'

import { scoreText, useMediaCard } from './media-card'

const sheetOpen = ref(false)

/** Открыто ли описание крупным планом: в плитке карточки текст идёт 11.5px. */
const aboutOpen = ref(false)

/** Какой знак сервиса ставить ярлычку оценки. Ключи приходят из media-card.ts, а имена
 * знаков — из BrandMark: словарь держит их вместе, чтобы разметка не знала ни о тех, ни о других. */
const MARK_BRAND: Record<string, 'anilist' | 'shikimori' | 'myanimelist'> = {
  al: 'anilist',
  shiki: 'shikimori',
  mal: 'myanimelist',
}

/** Граница «широкого окна»: та же, что у раскладки шапки в CSS. */
const WIDE_AT = '(min-width: 1400px)'

/** Широкое ли окно: от этого зависит, где живёт описание. На телевизоре описание в баннер не
 * переезжает никогда: часть приставок отдаёт 1920 при dpr 1, и баннер вырастал с 263 до 340 — съедал на треть кадра больше, чем экономил. */
const wide = ref(false)

/// Слабая ли платформа: на ней описание остаётся панелью при любой ширине.
const lite = isWeakPlatform()

let watchWide: MediaQueryList | null = null

function onWide(event: MediaQueryListEvent): void {
  wide.value = event.matches && !lite
}

const mediaId = computed<number>(() => {
  const raw = Number(currentRoute.value.params.id ?? '')
  return Number.isFinite(raw) && raw > 0 ? raw : 0
})

const {
  card,
  busy,
  trouble,
  franList,
  status,
  score10,
  progress,
  repeat,
  startedAt,
  completedAt,
  notes,
  partsTotal,
  listed,
  listLabel,
  mainTitle,
  heroStyle,
  about,
  aboutWait,
  aboutSource,
  facts,
  ratings,
  franchiseRows,
  franchiseHidden,
  load,
  studioLogo,
  franchiseName,
  franchiseStatus,
  franchiseHint,
  franchisePlay,
  onPartSeen,
  openFranchiseWork,
  openStudio,
  onPickStatus,
  onPickScore,
  onPickProgress,
  onPickRepeat,
  onPickStarted,
  onPickCompleted,
  onPickNotes,
  onPickRemove,
} = useMediaCard(mediaId)

// Просмотр — отдельный экран со своим адресом, а не окно поверх карточки: его можно обновить.
function openPlayer(): void {
  if (mediaId.value > 0) navigate('player', { id: String(mediaId.value) })
}

/** Подсказка метки доступности. Слов на самой метке нет: там только знак. */
function playHint(state: 'yes' | 'no' | null): string {
  return state === 'yes' ? 'Можно посмотреть' : 'Нет в каталоге'
}

/** Клик по описанию раскрывает его окном. Нажатие по ссылке или по спойлеру внутри разметки —
 *  это их работа, а не «раскрыть»: такие пропускаем. */
function onAboutHit(e: MouseEvent): void {
  // Описания нет — плитка не цель: взведённое нажатием окно раскрылось бы само, когда текст придёт.
  if (about.value === '') return

  const spot = e.target
  if (spot instanceof HTMLElement && spot.closest('a, button') !== null) return
  aboutOpen.value = true
}

/** Пульт: на цели с ролью кнопки браузер сам не кликает — раскрытие зовём руками.
 *  Ссылка в тексте и здесь остаётся ссылкой: её нажатие браузер разбирает сам. */
function onAboutKey(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return
  if (about.value === '') return

  const spot = e.target
  if (spot instanceof HTMLElement && spot.closest('a, button') !== null) return
  e.preventDefault()
  aboutOpen.value = true
}

onMounted(() => {
  const mq = window.matchMedia(WIDE_AT)
  wide.value = mq.matches && !lite
  mq.addEventListener('change', onWide)
  watchWide = mq

  void load()
})

onBeforeUnmount(() => {
  watchWide?.removeEventListener('change', onWide)
  watchWide = null
})

// Переход с карточки на карточку не пересобирает экран: грузим сами. Окна закрываются заодно.
watch(mediaId, () => {
  sheetOpen.value = false
  aboutOpen.value = false
  void load()
})

// На пульте карточка открывается сразу на «Смотреть»: пока фокус ни на ком, стрелки ведёт оболочка, и первое нажатие уходит первому по разметке (dpad.ts). Прокрутку не трогаем.
const playHit = ref<HTMLElement | null>(null)

watch(card, (now) => {
  if (!lite || now === null) return
  void nextTick(() => playHit.value?.focus({ preventScroll: true }))
})
</script>

<template>
  <section class="am-page">
    <div v-if="mediaId === 0" class="am-empty">
      <span class="am-empty__mark"><EmptyMark name="question" /></span>
      <span>Аниме не выбрано: в адресе нет номера.</span>
      <span>Откройте карточку из списков или поиска.</span>
    </div>

    <template v-else>
      <p v-if="trouble" class="am-error">{{ trouble }}</p>

      <div v-if="busy && !card" class="am-wait">
        <span class="am-skeleton am-wait__hero" />
        <span class="am-skeleton am-wait__line" />
        <span class="am-skeleton am-wait__line am-wait__line--short" />
      </div>

      <template v-if="card">
        <div class="am-hero" :class="{ 'am-hero--told': wide }">
          <div class="am-hero__art" :style="heroStyle" />
          <div class="am-hero__veil" />

          <div class="am-hero__body">
            <!-- Постер и текст — одной группой: половину шапки занимают они вдвоём. Иначе текст рос по
     содержимому: при десятке студий ряд пилюль не переносился, а вытеснял описание в узкую полосу. -->
            <div class="am-hero__lead">
              <!-- Постер и оценки площадок одной колонкой: ярлычки стоят под картинкой и по её ширине, как подпись. -->
              <div class="am-hero__stack">
                <img
                  v-if="card.cover"
                  class="am-hero__cover"
                  :src="card.cover"
                  :alt="mainTitle"
                  decoding="async"
                />
                <span v-else class="am-hero__cover am-hero__cover--empty" aria-hidden="true"
                  >?</span
                >

                <!-- Площадка названа знаком, а не словом: так ярлычок вдвое короче, и три встают в ряд под постером. -->
                <ul v-if="ratings.length > 0" class="am-hero__marks">
                  <li
                    v-for="rate in ratings"
                    :key="rate.key"
                    v-tip="`Средняя оценка на ${rate.label}`"
                    class="am-hero__mark"
                  >
                    <BrandMark
                      v-if="MARK_BRAND[rate.key]"
                      class="am-hero__markicon"
                      :name="MARK_BRAND[rate.key]!"
                    />
                    <span class="am-hero__markval">{{ rate.value }}</span>
                  </li>
                </ul>
              </div>

              <div class="am-hero__text">
                <h2 class="am-hero__title">{{ mainTitle }}</h2>
                <p v-if="card.romaji" class="am-hero__sub">{{ card.romaji }}</p>
                <p v-if="card.native" class="am-hero__sub">{{ card.native }}</p>

                <ul class="am-pills">
                  <li v-if="score10 > 0" class="am-pill am-pill--mine">
                    ★ {{ scoreText(score10) }}
                  </li>
                  <li v-for="item in facts" :key="item" class="am-pill">{{ item }}</li>
                  <li v-if="card.isAdult" class="am-pill am-pill--adult">18+</li>
                </ul>

                <ul v-if="card.genres.length > 0" class="am-pills">
                  <li v-for="genre in card.genres" :key="genre" class="am-pill am-pill--soft">
                    {{ genreWord(genre) }}
                  </li>
                </ul>

                <ul v-if="card.studios.length > 0" class="am-pills">
                  <li v-for="studio in card.studios" :key="studio.studioId">
                    <button
                      class="am-pill am-pill--studio"
                      :class="{ 'am-pill--studio-main': studio.main }"
                      type="button"
                      @click="openStudio(studio.studioId)"
                    >
                      <img
                        v-if="studioLogo(studio.name)"
                        class="am-pill__logo"
                        :src="studioLogo(studio.name)!"
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      {{ studio.name }}
                    </button>
                  </li>
                </ul>

                <div class="am-acts">
                  <!-- Подписи-всплывки у кнопки нет: на пульте плашка всплывает на каждом подведении, а «Смотреть» говорит само за себя. -->
                  <button ref="playHit" class="am-acts__play" type="button" @click="openPlayer">
                    <span aria-hidden="true">▶</span>
                    <span>Смотреть</span>
                  </button>

                  <button class="am-acts__save" type="button" @click="sheetOpen = true">
                    <span v-if="listed" class="am-acts__dot" aria-hidden="true" />
                    {{ listLabel }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Описание в шапке: только на широком окне, иначе оно остаётся панелью ниже. Текст со своей
     прокруткой: баннер не должен вытягиваться на два экрана из-за болтливого источника. -->
            <div v-if="wide" class="am-hero__note">
              <h3 class="am-h3 am-hero__noteh">Описание</h3>

              <div class="am-hero__scroll">
                <RichText v-if="about" class="am-about am-about--art" :text="about" plain />
                <div v-else-if="aboutWait" class="am-about__hold" aria-hidden="true">
                  <span class="am-skeleton am-about__hold-line" />
                  <span class="am-skeleton am-about__hold-line" />
                  <span class="am-skeleton am-about__hold-line am-about__hold-line--short" />
                </div>
                <p v-else class="am-hero__sub">Описания ни один источник не дал.</p>
              </div>

              <p v-if="aboutSource !== ''" class="am-about__tail am-about__tail--art">
                Описание отсюда: {{ aboutSource }}
              </p>
            </div>
          </div>
        </div>

        <div class="am-board">
          <!-- На широком окне панели описания здесь нет: текст ушёл в шапку, а его место заняли виджеты. Обёртка сквозная. -->
          <div v-if="!wide" class="am-split__main">
            <div
              class="am-panel am-about-box am-about__hit"
              :role="about ? 'button' : undefined"
              :tabindex="about ? 0 : undefined"
              @click="onAboutHit"
              @keydown="onAboutKey"
            >
              <h3 class="am-h3">Описание</h3>
              <!-- Разметка источника живая: спойлеры и начертания рисует компонент, а типографика .am-about остаётся на его корне. -->
              <!-- Текст раскрывается окном крупным планом: в плитке он идёт 11.5px, и с трёх метров его не читают.
     Цель — вся плитка, а не абзац: кромка фокуса обходит её контур, а не строки текста (см. `__hit`).
     Сплошным текстом: описания с Шикимори набиты ссылками на персонажей и другие аниме, и на
     приставке каждая становилась целью обхода посреди абзаца — пульт вставал на неё, а толку
     не было. На ПК те же ссылки живые, там на них есть куда идти. -->
              <RichText v-if="about" class="am-about" :text="about" plain />
              <div v-else-if="aboutWait" class="am-about__hold" aria-hidden="true">
                <span class="am-skeleton am-about__hold-line" />
                <span class="am-skeleton am-about__hold-line" />
                <span class="am-skeleton am-about__hold-line am-about__hold-line--short" />
              </div>
              <p v-else class="am-dim">Описания ни один источник не дал.</p>

              <p v-if="aboutSource !== ''" class="am-about__tail">
                Описание отсюда: {{ aboutSource }}
              </p>
            </div>
          </div>

          <!-- Музыка и франшиза делят ряд поровну. Обёртка сквозная: блок молчит, когда тем нет, и пустой
     колонки после себя не оставляет — оставшаяся плитка растягивается на ряд. -->
          <!-- Кадры и трейлер стоят там, где раньше был плеер: музыка ушла полосой вниз, её место заняла плитка кадров. -->
          <ShotBox :media-id="mediaId" :mal-id="card.malId" :trailer="card.trailer" />

          <div v-if="franchiseRows.length > 0" class="am-panel am-fran">
            <h3 class="am-h3">Франшиза</h3>

            <!-- v-seen сообщает о первом показе плитки: источники видео спрашиваются только о показанных частях
     дерева, а склад поднимается по всей полке — он даром (app/see-tile.ts). -->
            <!-- Полка, а не вертикальный список: у франшизы на три десятка частей список требовал по нажатию на
     часть, и до «Персонажей» внизу экрана доходили тридцать раз подряд. Ряд в одну строку доходит
     туда за одно нажатие вниз, а сама франшиза обходится так же, как любая полка. Обход полки —
     как на главной, без data-hold: тот центрировал бы каждую плитку и дёргал полку через одну. -->
            <div ref="franList" class="am-rail am-cards am-fran__rail" data-am-row>
              <!-- Ключ по записи, а не по узлу Шикимори: у раздробленной части строк несколько, и все при одном номере MAL. -->
              <!-- Разметка карточки — ровно как у персонажей (`am-face`), правила общие, из theme.css. -->
              <article
                v-for="work in franchiseRows"
                :key="work.mediaId ?? work.malId ?? work.name"
                v-seen="() => onPartSeen(work)"
                class="am-face"
              >
                <button
                  v-if="work.mediaId !== null && work.mediaId !== mediaId"
                  v-tip="franchiseHint(work)"
                  class="am-face__hit"
                  type="button"
                  @click="openFranchiseWork(work)"
                >
                  <span class="am-face__frame">
                    <img
                      v-if="work.cover"
                      class="am-face__art"
                      :src="work.cover"
                      :alt="work.name"
                      loading="lazy"
                      decoding="async"
                    />
                    <span v-else class="am-face__art am-face__art--empty" aria-hidden="true">
                      {{ work.name.slice(0, 1) }}
                    </span>
                    <!-- Молчание метки — это «не спрашивали», а не «нет»: пока источники не высказались все, ничего не рисуется. -->
                    <span
                      v-if="franchisePlay(work) !== null"
                      v-tip="playHint(franchisePlay(work))"
                      class="am-part__play"
                      :class="{ 'am-part__play--none': franchisePlay(work) === 'no' }"
                      role="img"
                      :aria-label="playHint(franchisePlay(work))"
                    />
                    <span v-if="franchiseStatus(work)" class="am-face__role">
                      {{ franchiseStatus(work) }}
                    </span>
                  </span>
                  <span class="am-face__name">{{ franchiseName(work) }}</span>
                </button>
                <div
                  v-else
                  v-tip="franchiseHint(work)"
                  class="am-face__hit am-face__hit--still"
                  :class="{ 'am-face__hit--here': work.mediaId === mediaId }"
                >
                  <span class="am-face__frame">
                    <img
                      v-if="work.cover"
                      class="am-face__art"
                      :src="work.cover"
                      :alt="work.name"
                      loading="lazy"
                      decoding="async"
                    />
                    <span v-else class="am-face__art am-face__art--empty" aria-hidden="true">
                      {{ work.name.slice(0, 1) }}
                    </span>
                    <span
                      v-if="franchisePlay(work) !== null"
                      v-tip="playHint(franchisePlay(work))"
                      class="am-part__play"
                      :class="{ 'am-part__play--none': franchisePlay(work) === 'no' }"
                      role="img"
                      :aria-label="playHint(franchisePlay(work))"
                    />
                    <span class="am-face__role am-face__role--here">вы здесь</span>
                  </span>
                  <span class="am-face__name">{{ franchiseName(work) }}</span>
                </div>

                <!-- Год — второй подписью, как озвучка у персонажа: своё место под названием, а не строкой над ним. -->
                <span class="am-face__voice">{{ work.year ?? '···' }}</span>
              </article>
            </div>

            <p v-if="franchiseHidden > 0" class="am-fran__hidden">
              Скрыто с меткой 18+: {{ franchiseHidden }}
            </p>
          </div>

          <div class="am-board__folk">
            <PeopleBox :media-id="mediaId" />
          </div>
        </div>

        <!-- Описание крупным планом: своё окно, а не второй вид той же плитки. -->
        <AboutBox v-if="about" :open="aboutOpen" :text="about" @close="aboutOpen = false" />

        <!-- Признак онгоинга окну нужен для автозакладки: у идущего сезона потолок счёта — последняя
     вышедшая серия, и дошёдший до края счёт ещё не значит «просмотрено». -->
        <EntrySheet
          v-if="sheetOpen"
          :title="mainTitle"
          :status="status"
          :score10="score10"
          :progress="progress"
          :parts-total="partsTotal"
          :ongoing="card.airingEpisode !== null"
          :repeat="repeat"
          :started-at="startedAt"
          :completed-at="completedAt"
          :notes="notes"
          @close="sheetOpen = false"
          @status="onPickStatus"
          @score="onPickScore"
          @progress="onPickProgress"
          @repeat="onPickRepeat"
          @started-at="onPickStarted"
          @completed-at="onPickCompleted"
          @notes="onPickNotes"
          @remove="onPickRemove"
        />
      </template>
    </template>
  </section>
</template>

<style scoped src="./media-screen.css"></style>

<!-- Основное оформление живёт в media-screen.css. Здесь метка доступности, ярлычки оценок и
     новая раскладка доски: правила рядом с разметкой, которая их завела. -->
<style scoped>
/* Форма знака доступности: квадрат под треугольник. Цвет и тень — в media-screen.css, тут их быть не должно: знак лежит поверх обложки, и там решает общий слой. */
.am-part__play {
  display: grid;
  place-items: center;
  align-self: center;
  width: 16px;
  height: 16px;
}

/* clip-path, а не рамки: так треугольник остаётся ровно в центре квадрата и поверх него можно положить перечёркивание. */
.am-part__play::before {
  grid-area: 1 / 1;
  width: 9px;
  height: 11px;
  content: '';
  background: currentcolor;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

.am-part__play--none::after {
  grid-area: 1 / 1;
  width: 17px;
  height: 2px;
  content: '';
  background: currentcolor;
  border-radius: 1px;
  transform: rotate(-45deg);
}

/* Колонка постера: ширина живёт здесь, а не на картинке, чтобы ярлычки переносились по её краю, а не по своей сумме. */
.am-hero__stack {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 12px;
  width: clamp(150px, 13vw, 226px);
}

.am-hero__stack .am-hero__cover {
  width: 100%;
}

/* Оценки площадок — ярлычки под постером: четыре цифры не стоили целой плитки. Ряд не растягивается
   и стоит по центру: когда третий знак не влезает, он переносится под два первых и остаётся посередине. */
.am-hero__marks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Стекло той же выделки, что пилюли у названия: плотная заливка на светлом кадре читалась заплатками.
   Знак и цифра в одну строку: имена площадок словами разгоняли ярлычки на два этажа по две штуки. */
.am-hero__mark {
  display: flex;
  flex: 0 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 5px 8px;
  background: color-mix(in srgb, var(--am-veil) 44%, transparent);
  border: 1px solid color-mix(in srgb, var(--am-on-art) 14%, transparent);
  border-radius: var(--am-r-cap);
  backdrop-filter: blur(10px) saturate(1.2);
  transition: border-color var(--am-fast) var(--am-ease);
}

.am-hero__mark:hover:where(:not(.am-lite *)) {
  border-color: color-mix(in srgb, var(--am-warn) 52%, transparent);
}

/* Знак мелкий, но не мельче: ниже 14 пикселей буквы плит перестают различаться и все три ярлычка одинаковы. */
.am-hero__markicon {
  width: 18px;
  height: 18px;
}

.am-hero__markval {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--am-on-art);
  font-variant-numeric: tabular-nums;
}

/* Проба вида: описание стоит по горизонтальной оси баннера, как постер и название, а не тянется во всю высоту. */
.am-hero--told .am-hero__note {
  align-self: center;
  justify-content: center;
  height: auto;
}

/* Прокрутка у описания остаётся, но блок больше не занимает всю свободную высоту: растёт до потолка и стоит по центру. */
.am-hero--told .am-hero__scroll {
  flex: 0 1 auto;
}

/* Стекло гаснет ко всем трём краям блока, а не только влево: у блока ниже баннера размытие кончалось
   прямой линией, и сверху и снизу оставались резкие полосы кадра. Масок две, пересечением. */
.am-hero--told .am-hero__note::before {
  -webkit-mask-image:
    linear-gradient(90deg, transparent 0%, #000 34%),
    linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%);
  mask-image:
    linear-gradient(90deg, transparent 0%, #000 34%),
    linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

/* Плитки доски берут свою высоту, а не тянутся по соседу: растянутая панель оставляет под содержимым
   пустую полосу. `:deep` у кадров нужен потому, что плитка кадров — чужой компонент с пятью корнями. */
.am-board > :deep(.am-shots),
.am-board > .am-fran {
  align-self: start;
}

/* Доска — одна колонка: кадры, франшиза и персонажи идут полосами во всю ширину, как полки главной.
   Две колонки оставляли франшизу в половине экрана, и её полка показывала четыре обложки в узкой
   полосе — ряд читался сжатым рядом с широкой полкой персонажей под ним. */
.am-board {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
</style>
