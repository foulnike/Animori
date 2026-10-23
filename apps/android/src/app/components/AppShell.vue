<script setup lang="ts">
// Рамка окна: шапка с кнопкой меню, шторка навигации, сменный экран внутри; имена и подписи экранов живут в routes.ts.
// Рельса нет: на телефоне вкладки открываются шторкой слева, закрывается она тапом, «Назад» или выбором пункта.

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { pushBackStop, runBackStop } from '../back-stop'
import { useScrollLock } from '../scroll-lock'
import { currentRoute, goBack, navigate, navDirection } from '../router'
import { MENU, SCREEN_TITLES } from '../router/routes'
import { updateOffer, updateOpen } from '../update'

import AppMark from './AppMark.vue'
import RailIcon from './RailIcon.vue'

const version = __ANIMORI_VERSION__

const active = computed(() => currentRoute.value.name)
const title = computed(() => SCREEN_TITLES[active.value])

type MenuName = (typeof MENU)[number]['name']

// «Назад» нужен только там, куда пришли изнутри: с экранов меню он увёл бы в пустую историю окна. Журнал обязателен: в меню его нет, вход — из настроек.
const BACK_SCREENS: ReadonlyArray<string> = ['media', 'studio', 'log']

const canGoBack = computed(() => BACK_SCREENS.includes(active.value))

const drawer = ref(false)
const menuBtn = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)

// Шторка замирает фон, пока открыта.
useScrollLock(() => drawer.value)

let dropStop: (() => void) | null = null

function openDrawer(): void {
  drawer.value = true
}

/** Закрытие возвращает фокус на кнопку меню: без этого обход с клавиатуры начинался бы с середины страницы. */
function closeDrawer(): void {
  drawer.value = false
  menuBtn.value?.focus()
}

// Свайпы: открытие — от левого края экрана, закрытие — влево по шторке. Кнопка в шапке остаётся
// запасным путём: жест есть не на каждом устройстве и не для клавиатуры.
const EDGE_PX = 28
const SWIPE_PX = 56
const SWIPE_SLANT = 48

let edgeX = 0
let edgeY = 0
let edgeOn = false
let swipeX = 0
let swipeY = 0

function onEdgeStart(event: TouchEvent): void {
  if (drawer.value) return

  const touch = event.changedTouches[0]
  if (touch === undefined || touch.clientX > EDGE_PX) return

  edgeOn = true
  edgeX = touch.clientX
  edgeY = touch.clientY
}

function onEdgeEnd(event: TouchEvent): void {
  if (!edgeOn) return

  edgeOn = false
  const touch = event.changedTouches[0]
  if (touch === undefined) return

  const dx = touch.clientX - edgeX
  if (dx > SWIPE_PX && Math.abs(touch.clientY - edgeY) < SWIPE_SLANT) openDrawer()
}

function onSwipeStart(event: TouchEvent): void {
  const touch = event.changedTouches[0]
  if (touch === undefined) return

  swipeX = touch.clientX
  swipeY = touch.clientY
}

function onSwipeEnd(event: TouchEvent): void {
  const touch = event.changedTouches[0]
  if (touch === undefined) return

  const dx = touch.clientX - swipeX
  if (dx < -SWIPE_PX && Math.abs(touch.clientY - swipeY) < SWIPE_SLANT) closeDrawer()
}

// Аппаратная «Назад» закрывает шторку, а не листает историю: запись, пока шторка открыта.
// Фокус уходит на панель, чтобы Tab и скринридер начинали с содержимого шторки, а не с экрана под ней.
watch(drawer, (on) => {
  if (on) {
    void nextTick(() => panel.value?.focus())
    dropStop = pushBackStop(function () {
      closeDrawer()
      return true
    })
  } else {
    dropStop?.()
    dropStop = null
  }
})

/** Выбор пункта меню. detail у клавиатуры равен нулю — там фокус остаётся на кнопке. */
function onPick(name: MenuName, e: MouseEvent): void {
  if (e.detail > 0 && e.currentTarget instanceof HTMLElement) e.currentTarget.blur()
  navigate(name)
  closeDrawer()
}

/** Шаг назад: сперва закрывается окно поверх экрана, потом — переход по истории. */
function onBack(): void {
  if (runBackStop()) return
  goBack()
}

// Смена экрана всегда начинается с верха: позиция прошлого экрана не должна выезжать на новый.
// Памяти позиций, как на ПК, на телефоне нет — там возврат на карточку уходит в плеер,
// а из плеера назад человек возвращается к началу карточки, а не к её середине.
watch(
  active,
  () => {
    window.scrollTo(0, 0)
  },
  { flush: 'post' },
)

function onReload(): void {
  window.location.reload()
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && drawer.value) closeDrawer()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('touchstart', onEdgeStart, { passive: true })
  window.addEventListener('touchend', onEdgeEnd, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('touchstart', onEdgeStart)
  window.removeEventListener('touchend', onEdgeEnd)
  dropStop?.()
  dropStop = null
})
</script>

<template>
  <div class="am-shell">
    <div class="am-body">
      <header class="am-top">
        <button
          ref="menuBtn"
          class="am-top__menu"
          type="button"
          aria-label="Меню"
          :aria-expanded="drawer"
          aria-controls="am-drawer"
          @click="openDrawer"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3.4 6h13.2M3.4 10h13.2M3.4 14h13.2" />
          </svg>
        </button>

        <!-- Стрелка нарисована, а не набрана знаком ←: текстовая стрелка в каждом шрифте своей толщины и длины. -->
        <button v-if="canGoBack" class="am-top__back" type="button" @click="onBack">
          <span class="am-top__sign" aria-hidden="true">
            <svg class="am-top__arrow" viewBox="0 0 16 16">
              <path d="M9.9 3.3 5.2 8l4.7 4.7" />
            </svg>
          </span>
          <span class="am-top__word">Назад</span>
        </button>

        <h1 class="am-top__title">{{ title }}</h1>

        <span class="am-top__gap" />

        <button aria-label="Обновить окно" class="am-top__icon" type="button" @click="onReload">
          <span aria-hidden="true">⟳</span>
        </button>
      </header>

      <main class="am-view">
        <div
          :key="active"
          class="am-view__hold"
          :class="{
            'am-view__hold--deep': navDirection === 'deep',
            'am-view__hold--back': navDirection === 'back',
            'am-view__hold--fill': active === 'settings',
          }"
        >
          <slot />
        </div>
      </main>
    </div>

    <Teleport to="body">
      <Transition name="am-drawer">
        <div
          v-if="drawer"
          id="am-drawer"
          class="am-drawer"
          @click="closeDrawer"
          @touchstart="onSwipeStart"
          @touchend="onSwipeEnd"
        >
          <!-- Панель — диалог: так обход и скринридер получают границу «окно поверх страницы».
             tabindex="-1" — фокус на панель без видимой рамки. -->
          <aside
            ref="panel"
            class="am-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Меню"
            tabindex="-1"
            @click.stop
          >
            <div class="am-drawer__brand">
              <AppMark class="am-drawer__logo" />
              <span class="am-drawer__name">AniMori</span>
            </div>

            <nav class="am-drawer__menu">
              <button
                v-for="item in MENU"
                :key="item.name"
                class="am-drawer__item"
                :class="{ 'am-drawer__item--on': item.name === active }"
                type="button"
                :aria-current="item.name === active ? 'page' : undefined"
                @click="onPick(item.name, $event)"
              >
                <span class="am-drawer__icon"><RailIcon :name="item.icon" /></span>
                <span class="am-drawer__text">{{ item.title }}</span>
              </button>
            </nav>

            <div class="am-drawer__acts">
              <!-- Пункт обновления появляется сам, когда проверка при старте нашла выпуск новее,
         и последний: он не действие на каждый день, а редкий случай. -->
              <button
                v-if="updateOffer"
                class="am-drawer__item am-drawer__item--new"
                type="button"
                @click="updateOpen = true"
              >
                <span class="am-drawer__icon am-drawer__icon--dot"><RailIcon name="update" /></span>
                <span class="am-drawer__text">Новая версия</span>
              </button>
            </div>

            <span class="am-drawer__foot">{{ version }}</span>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Место под рельс больше не нужно: шапка занимает весь верх, поля держит .am-view. */
.am-shell {
  min-height: 100vh;
}

.am-body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
}

/* Шапка держится сверху: при сетке в тысячу плиток вернуться к ней иначе долго.
   Поле сверху складывается с системным: край за вырезом дисплея. */
.am-top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 8px;
  align-items: center;
  /* Поля берут максимум из env и моста: навбар в три кнопки в env() не приходит. */
  padding: calc(max(env(safe-area-inset-top), var(--am-sys-top)) + 8px) clamp(12px, 4vw, 20px) 8px;
}

/* Граница шапки — перетекание вниз, а не линия: жёсткий край резал уезжающие плитки.
   Слой отдельный: маска на самой шапке съела бы и кнопки вместе с фоном. */
.am-top::before {
  position: absolute;
  inset: 0 0 -28px;
  content: '';
  background: linear-gradient(180deg, var(--am-bar) 0%, var(--am-bar) 58%, transparent 100%);
  backdrop-filter: blur(var(--am-blur-strong)) saturate(1.2);
  -webkit-mask-image: linear-gradient(180deg, #000 58%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 58%, transparent 100%);
  pointer-events: none;
}

.am-top > * {
  position: relative;
  z-index: 1;
}

/* Кнопка меню — в тач-цель целиком, знак внутри неё. Отрицательное поле подтягивает
   её к кромке, не уменьшая площадь нажатия. */
.am-top__menu {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--am-touch);
  height: var(--am-touch);
  margin-left: -8px;
  padding: 0;
  font: inherit;
  color: var(--am-dim);
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease);
}

.am-top__menu:active,
.am-top__menu:focus-visible {
  color: var(--am-text);
  background: var(--am-fill-1);
}

.am-top__menu:focus-visible {
  box-shadow: var(--am-sh-ring);
}

.am-top__menu > svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

/* Отступ слева меньше правого: у кружка своя подложка, и равные отступы читались бы дырой перед ним. */
.am-top__back {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: var(--am-touch);
  padding: 0 15px 0 5px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease),
    box-shadow var(--am-mid) var(--am-ease);
}

.am-top__back:active,
.am-top__back:focus-visible {
  color: var(--am-text);
  background: var(--am-fill-2);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
  box-shadow: var(--am-sh-ring);
}

/* Кружок со стрелкой: акцентная подложка держит знак как отдельное действие, а не как букву перед словом. */
.am-top__sign {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--am-accent);
  background: var(--am-accent-soft);
  border-radius: var(--am-r-cap);
}

.am-top__arrow {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.am-top__title {
  overflow: hidden;
  min-width: 0;
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.012em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-top__gap {
  flex: 1;
}

.am-top__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--am-touch);
  height: var(--am-touch);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition: color var(--am-fast) var(--am-ease);
}

.am-top__icon:active,
.am-top__icon:focus-visible {
  color: var(--am-text);
}

/* Заслонка и панель поверх всего, включая шапку. */
.am-drawer {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: var(--am-veil);
  animation: am-veil var(--am-fast) var(--am-ease) both;
}

.am-drawer__panel {
  display: flex;
  flex-direction: column;
  width: min(300px, 82vw);
  height: 100%;
  padding: calc(max(env(safe-area-inset-top), var(--am-sys-top)) + 14px) 12px
    calc(max(env(safe-area-inset-bottom), var(--am-sys-bottom)) + 12px)
    max(env(safe-area-inset-left), 12px);
  overflow-y: auto;
  background: var(--am-panel);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
  outline: none;
  animation: am-drawer-in var(--am-mid) var(--am-ease) both;
}

@keyframes am-veil {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes am-drawer-in {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: none;
  }
}

.am-drawer-leave-active {
  pointer-events: none;
  animation: am-veil-out var(--am-mid) var(--am-ease) both;
}

.am-drawer-leave-active .am-drawer__panel {
  animation: am-drawer-out var(--am-mid) var(--am-ease) both;
}

@keyframes am-veil-out {
  to {
    opacity: 0;
  }
}

@keyframes am-drawer-out {
  from {
    transform: none;
  }
  to {
    transform: translateX(-100%);
  }
}

.am-drawer__brand {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 2px 6px 14px;
}

.am-drawer__logo {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 13px;
  /* Ареол ровно по знаку: со смещением вниз он читался не подсветкой эмблемы, а пятном под ней. */
  box-shadow: 0 0 22px rgb(var(--am-accent-rgb) / 0.35);
}

/* На AMOLED ореол убирается: свечение вокруг тёмного знака на чистом чёрном читается грязным пятном. */
:global([data-am-skin='amoled']) .am-drawer__logo {
  box-shadow: none;
}

.am-drawer__name {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.am-drawer__menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Служебные действия отделены от вкладок промежутком, а не линией: проще и того же стекла. */
.am-drawer__acts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 18px;
}

.am-drawer__item {
  position: relative;
  display: flex;
  gap: 13px;
  align-items: center;
  min-height: 52px;
  padding: 0 14px;
  font: inherit;
  font-size: 15px;
  font-weight: 550;
  color: var(--am-dim);
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-m);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease);
}

.am-drawer__item:active {
  color: var(--am-text);
  background: var(--am-fill-1);
}

.am-drawer__item--on {
  color: var(--am-text);
  background: linear-gradient(
    100deg,
    rgb(var(--am-accent-rgb) / 0.22),
    rgb(var(--am-accent-2-rgb) / 0.1)
  );
}

.am-drawer__icon {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
}

/* Точка у значка: в шторке пункты подписаны, но «есть обновление» всё равно должно бросаться в глаза. */
.am-drawer__icon--dot::after {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 7px;
  height: 7px;
  content: '';
  background: var(--am-accent);
  border: 1px solid var(--am-panel);
  border-radius: 50%;
}

/* Сам пункт — акцентом: это не служебное действие, а предложение. */
.am-drawer__item--new {
  color: var(--am-text);
}

.am-drawer__foot {
  margin-top: auto;
  padding: 14px 10px 0;
  font-size: 12px;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

.am-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  /* Низ дополнен системным полем: жестовая полоса накрывает содержимое. */
  padding: clamp(14px, 1.6vw, 30px) clamp(14px, 4vw, 20px)
    calc(clamp(16px, 1.6vw, 30px) + max(env(safe-area-inset-bottom), var(--am-sys-bottom)));
}

/* Потолок ширины с центровкой: без него на широком окне строка текста тянулась бы метрами. */
.am-view__hold {
  width: 100%;
  max-width: var(--am-page-max);
  margin: 0 auto;
  animation: am-rise var(--am-mid) var(--am-ease) both;
}

/* Ключ на имени экрана перезапускает am-rise на каждом переходе. На смене вкладок
   движение то же: вкладки стоят вровень, и сдвиг вбок сообщал бы о переходе, которого не было. */
@keyframes am-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Экран-кадр: держит высоту вида, а не растёт по содержимому — им пользуются настройки. */
.am-view__hold--fill {
  flex: 1 1 auto;
  min-height: 0;
}

/* Внутрь содержимое приходит справа, наружу — слева. 18 пикселей — ровно боковое
   поле .am-view, сдвиг уходит в поле, а не за край окна. */
.am-view__hold--deep {
  animation-name: am-deep;
}

.am-view__hold--back {
  animation-name: am-back;
}

@keyframes am-deep {
  from {
    opacity: 0;
    transform: translate3d(18px, 0, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes am-back {
  from {
    opacity: 0;
    transform: translate3d(-18px, 0, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Узкое окно: остаётся убрать слово у «Назад» — капсула становится ровным кружком. */
@media (max-width: 480px) {
  .am-top__word {
    display: none;
  }

  .am-top__back {
    padding: 0 5px;
  }
}

/* Спокойное движение: системная просьба сильнее наших красот. */
@media (prefers-reduced-motion: reduce) {
  .am-view__hold,
  .am-drawer,
  .am-drawer__panel,
  .am-drawer-leave-active,
  .am-drawer-leave-active .am-drawer__panel {
    animation: none;
  }
}
</style>
