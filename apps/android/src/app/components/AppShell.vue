<script setup lang="ts">
// Рамка окна — рельс, шапка, сменный экран внутри; имена и подписи экранов живут в routes.ts. Рельс раскрывается поверх содержимого (fixed, не sticky).

import { computed } from 'vue'

import { APPEARANCES, appearance, setAppearance } from '../appearance'
import { runBackStop } from '../back-stop'
import { isWeakPlatform } from '../platform'
import { currentRoute, goBack, navigate, navDirection } from '../router'
import { MENU, SCREEN_TITLES } from '../router/routes'
import { updateOffer, updateOpen } from '../update'

import AppMark from './AppMark.vue'
import RailIcon from './RailIcon.vue'

const version = __ANIMORI_VERSION__

/** Телевизор ли: там шапки нет, а «Назад» и «Обновить» живут в рельсе. */
const lite = isWeakPlatform()

const active = computed(() => currentRoute.value.name)
const title = computed(() => SCREEN_TITLES[active.value])

type MenuName = (typeof MENU)[number]['name']

// «Назад» нужен только там, куда пришли изнутри: с экранов меню он увёл бы в пустую историю окна. Журнал обязателен: в меню его нет, вход — из настроек.
const BACK_SCREENS: ReadonlyArray<string> = ['media', 'studio', 'log']

const canGoBack = computed(() => BACK_SCREENS.includes(active.value))

/** Выбор пункта меню. detail у клавиатуры равен нулю — там фокус остаётся на
 *  кнопке, иначе обход меню оборвётся на первом же выборе. */
function onPick(name: MenuName, e: MouseEvent): void {
  if (e.detail > 0 && e.currentTarget instanceof HTMLElement) e.currentTarget.blur()
  navigate(name)
}

/** Шаг назад: сперва закрывается окно поверх экрана, потом — переход по
 * истории. Окно первым потому, что человек видит его, а не экран под ним. */
function onBack(): void {
  if (runBackStop()) return
  goBack()
}

function onReload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="am-shell">
    <div class="am-body">
      <!-- Шапки на телевизоре нет: «Назад» и «Обновить» переехали в рельс.
     Их кнопки в шапке стояли над баннером карточки и отбирали у него фокус. -->
      <header v-if="!lite" class="am-top">
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

        <!-- v-tip рисует плашку, но не даёт имени скринридеру: у молчаливых кнопок
             доступное имя задаётся явно, тем же текстом. -->
        <div class="am-skin" role="group" aria-label="Тема оформления">
          <button
            v-for="item in APPEARANCES"
            :key="item.name"
            v-tip="item.title"
            :aria-label="item.title"
            class="am-skin__btn"
            :class="{ 'am-skin__btn--on': item.name === appearance }"
            type="button"
            :aria-pressed="item.name === appearance"
            @click="setAppearance(item.name)"
          >
            <span aria-hidden="true">{{ item.mark }}</span>
          </button>
        </div>

        <button
          v-tip="'Обновить окно'"
          aria-label="Обновить окно"
          class="am-top__icon"
          type="button"
          @click="onReload"
        >
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
          }"
        >
          <slot />
        </div>
      </main>
    </div>

    <!-- Рельс стоит в разметке последним, хотя на экране слева: оболочка берёт для фокуса
     первый элемент по разметке, и с рельсом в начале экран открывался бы с меню. -->
    <aside class="am-side">
      <div class="am-side__brand">
        <AppMark class="am-side__logo" />

        <span class="am-side__name">AniMori</span>
      </div>

      <nav class="am-side__menu">
        <!-- Подписи-всплывки у пунктов нет: рядом стоит её же текст, а на пульте плашка загораживает кнопку. -->
        <button
          v-for="item in MENU"
          :key="item.name"
          class="am-side__item"
          :class="{ 'am-side__item--on': item.name === active }"
          type="button"
          @click="onPick(item.name, $event)"
        >
          <span class="am-side__icon"><RailIcon :name="item.icon" /></span>
          <span class="am-side__text">{{ item.title }}</span>
        </button>

        <!-- Служебные действия — в конец рельса и только на телевизоре: в шапке они отбирали фокус у содержимого. -->
        <button
          v-if="lite && canGoBack"
          class="am-side__item am-side__item--act"
          type="button"
          @click="onBack"
        >
          <span class="am-side__icon"><RailIcon name="back" /></span>
          <span class="am-side__text">Назад</span>
        </button>

        <button
          v-if="lite"
          class="am-side__item am-side__item--act"
          type="button"
          @click="onReload"
        >
          <span class="am-side__icon"><RailIcon name="reload" /></span>
          <span class="am-side__text">Обновить</span>
        </button>

        <!-- Пункт обновления появляется сам, когда проверка при старте нашла выпуск новее,
     и живёт последним: он не действие на каждый день, а редкий случай. -->
        <button
          v-if="lite && updateOffer"
          class="am-side__item am-side__item--act am-side__item--new"
          type="button"
          @click="updateOpen = true"
        >
          <span class="am-side__icon am-side__icon--dot"><RailIcon name="update" /></span>
          <span class="am-side__text">Новая версия</span>
        </button>
      </nav>

      <span class="am-side__foot">{{ version }}</span>
    </aside>
  </div>
</template>

<style scoped>
/* Место под рельс держит отступ, а не колонка сетки: рельс в fixed выпадает из
   потока, и авторасстановка ставит тело в узкую колонку под рельс. */
.am-shell {
  min-height: 100vh;
  padding-left: var(--am-side-slim);
}

/* Рельс оторван от краёв окна: стекло видно только там, где есть что размывать.
   Поверх шапки (z-index 6 против 5); overflow держит подписи в сложенном состоянии. */
.am-side {
  position: fixed;
  top: 14px;
  bottom: 14px;
  left: 14px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: calc(var(--am-side-slim) - 14px);
  padding: 18px 12px 16px;
  overflow: hidden;
  background: var(--am-glass);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-xl);
  box-shadow:
    var(--am-sh-1),
    inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur-strong)) saturate(1.3);
  transition:
    width var(--am-mid) var(--am-ease),
    box-shadow var(--am-mid) var(--am-ease);
}

/* Фокус равен курсору: иначе обход меню с клавиатуры шёл бы по слепым значкам.
   Фокус снимает onPick — иначе это правило держало рельс разложенным после мыши. */
.am-side:hover:where(:not(.am-lite *)),
.am-side:focus-within {
  width: calc(var(--am-side) - 14px);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
}

/* Логотип сдвинут так, чтобы центр совпал с центрами значков меню: 6 + 17 = 14 + 9. */
.am-side__brand {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 2px 6px 6px;
}

.am-side__logo {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  /* Ареол ровно по знаку: со смещением вниз он читался не подсветкой эмблемы, а пятном под ней. */
  box-shadow: 0 0 22px rgb(var(--am-accent-rgb) / 0.35);
}

/* На AMOLED ореол убирается: свечение вокруг тёмного знака на чистом чёрном читается грязным пятном. */
:global([data-am-skin='amoled']) .am-side__logo {
  box-shadow: none;
}

/* display: none здесь нельзя: его не переходит, и текст вскакивал бы рывком.
   nowrap обязателен: в узком рельсе слово иначе ломается по буквам и тянет высоту кнопки. */
.am-side__name,
.am-side__text,
.am-side__foot {
  white-space: nowrap;
  opacity: 0;
  transition:
    opacity var(--am-fast) var(--am-ease),
    transform var(--am-mid) var(--am-ease);
  transform: translateX(-6px);
}

.am-side:hover:where(:not(.am-lite *)) .am-side__name,
.am-side:hover:where(:not(.am-lite *)) .am-side__text,
.am-side:hover:where(:not(.am-lite *)) .am-side__foot,
.am-side:focus-within .am-side__name,
.am-side:focus-within .am-side__text,
.am-side:focus-within .am-side__foot {
  opacity: 1;
  transform: none;
}

.am-side__name {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.am-side__menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.am-side__item {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: var(--am-touch);
  padding: 0 14px;
  font: inherit;
  font-weight: 550;
  color: var(--am-dim);
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease);
}

.am-side__item:hover:where(:not(.am-lite *)) {
  color: var(--am-text);
  background: var(--am-fill-1);
}

.am-side__item--on {
  color: var(--am-text);
  background: linear-gradient(
    100deg,
    rgb(var(--am-accent-rgb) / 0.22),
    rgb(var(--am-accent-2-rgb) / 0.1)
  );
}

/* Свёрнутый рельс: подпись не занимает места, значок центрируется по рельсу.
   Главный тумблер — класс .am-side--open, :hover оставлен для ПК. */
.am-side:not(.am-side--open):not(:hover:where(:not(.am-lite *))):not(:focus-within) .am-side__item {
  justify-content: center;
  padding: 0;
  gap: 0;
}
.am-side:not(.am-side--open):not(:hover:where(:not(.am-lite *))):not(:focus-within) .am-side__text {
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
}

/* Значок пункта — в своём квадрате с центровкой по двум осям: text-align ровнял только по горизонтали, а по вертикали знак стоял на базовой линии шрифта, и ряд пунктов плясал. */
.am-side__icon {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
}

/* Точка у значка: свёрнутый рельс подписи не показывает, и «есть обновление»
   иначе сообщил бы один вид нового пункта — его легко не заметить. */
.am-side__icon--dot::after {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 7px;
  height: 7px;
  content: '';
  background: var(--am-accent);
  border: 1px solid var(--am-panel-2);
  border-radius: 50%;
}

/* Сам пункт — акцентом: это не служебное действие, а предложение. */
.am-side__item--new {
  color: var(--am-text);
}

.am-side__foot {
  margin-top: auto;
  padding: 0 10px;
  font-size: 12px;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

.am-body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
}

/* Шапка держится сверху: при сетке в тысячу плиток вернуться к ней иначе долго. */
.am-top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px clamp(18px, 2vw, 44px);
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

/* Отступ слева меньше правого: у кружка своя подложка, и равные отступы читались бы дырой перед ним. */
.am-top__back {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: 34px;
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

/* Едет одна стрелка, а не вся кнопка: сдвиг капсулы тащил за собой рамку и кольцо фокуса.
   Отклик — кромка по краю капсулы, без размытого пятна под ней. */
.am-top__back:hover:where(:not(.am-lite *)),
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
  transition:
    background-color var(--am-fast) var(--am-ease),
    transform var(--am-fast) var(--am-ease);
}

.am-top__back:hover:where(:not(.am-lite *)) .am-top__sign,
.am-top__back:focus-visible .am-top__sign {
  background: rgb(var(--am-accent-rgb) / 0.22);
  transform: translateX(-2px);
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
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.012em;
}

.am-top__gap {
  flex: 1;
}

/* Три знака в одной капсуле; подписи живут в подсказке — три слова в шапке шумели бы громче заголовка. */
.am-skin {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
}

/* Знаки тем разной высоты, поэтому центр считается от кнопки, а не от строки текста. */
.am-skin__btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 28px;
  padding: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  color: var(--am-faint);
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-mid) var(--am-ease);
}

.am-skin__btn:hover:where(:not(.am-lite *)),
.am-skin__btn:focus-visible {
  color: var(--am-text);
}

.am-skin__btn > span {
  display: block;
  transition: transform var(--am-fast) var(--am-ease);
}

/* Знак поднимается вместо подсветки целой кнопки: подложка занята выбранной темой. */
.am-skin__btn:hover:where(:not(.am-lite *)) > span,
.am-skin__btn:focus-visible > span {
  transform: translateY(-1px);
}

.am-skin__btn--on {
  color: var(--am-text);
  background: var(--am-glass-2);
  box-shadow:
    var(--am-sh-1),
    inset 0 1px 0 var(--am-edge);
}

.am-top__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  font: inherit;
  font-size: 16px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease);
}

.am-top__icon:hover:where(:not(.am-lite *)),
.am-top__icon:focus-visible {
  color: var(--am-text);
  border-color: var(--am-accent);
}

/* Крутится сам знак, а не кнопка: поворот тащил бы за собой рамку и фокусное кольцо. */
.am-top__icon > span {
  display: block;
  transition: transform var(--am-slow) var(--am-ease);
}

.am-top__icon:hover:where(:not(.am-lite *)) > span,
.am-top__icon:focus-visible > span {
  transform: rotate(180deg);
}

.am-view {
  flex: 1;
  width: 100%;
  /* Низ равен верху: 72 px под музыкальную полосу ушли вместе с ней (плеера на приставке нет),
     а поле осталось бы пустым под каждым экраном. */
  padding: clamp(16px, 1.6vw, 30px) clamp(18px, 2vw, 44px) clamp(16px, 1.6vw, 30px);
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

/* Узкое окно: рельс и так сложен, остаётся убрать слово у «Назад» — капсула становится ровным кружком. */
@media (max-width: 1080px) {
  .am-top__word {
    display: none;
  }

  .am-top__back {
    padding: 0 5px;
  }
}

/* Спокойное движение: системная просьба сильнее наших красот. */
@media (prefers-reduced-motion: reduce) {
  .am-view__hold {
    animation: none;
  }

  .am-side__name,
  .am-side__text,
  .am-side__foot,
  .am-top__back:hover:where(:not(.am-lite *)) .am-top__sign,
  .am-top__back:focus-visible .am-top__sign,
  .am-skin__btn:hover:where(:not(.am-lite *)) > span,
  .am-skin__btn:focus-visible > span,
  .am-top__icon:hover:where(:not(.am-lite *)) > span,
  .am-top__icon:focus-visible > span {
    transform: none;
  }
}
</style>
