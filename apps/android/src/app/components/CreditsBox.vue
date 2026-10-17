<script setup lang="ts">
// Источники и права: какие сервисы стоят за данными и на каких условиях программа их показывает.
//
// Отдельной модалкой, а не блоком в окне настроек. Причина техническая: окно настроек листает обход
// пультом, а обход скроллит только до фокусируемой цели — статичный текст под последней кнопкой он
// не показывает, и оговорки оказывались недостижимы. Здесь тело окна листается стрелками само, как в
// справке про перенос списка.
//
// Разметка и стили — те же, что у CloudHelp: окно, которое на приставке уже проверено, не должно
// отличаться от второго окна ничем, кроме текста.

import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { pushBackStop } from '../back-stop'
import { canOpenOutside } from '../platform'
import { Bridge } from '@/bridge'

/** Открыто ли окно. */
const open = ref(false)

/** Есть ли куда уводить ссылки: на приставке браузера нет, адрес показывается текстом. */
const outside = canOpenOutside()

/** Тело окна: его листают стрелками. */
const body = ref<HTMLElement | null>(null)

/** Список источников. Порядок — по роли в программе: сперва то, что стоит на каждой карточке. */
const SOURCES = [
  { name: 'AniList', what: 'каталог, списки, расписание выхода' },
  { name: 'Шикимори', what: 'русские названия, описания, персонажи и персонал' },
  { name: 'Kodik, Anilibria', what: 'ссылки на видео' },
  { name: 'animori-data', what: 'датасет русских названий, CC0-1.0' },
]

/** Оговорки. Язык сухой и юридический не случайно: этот текст читают вслух при разборе,
 *  и мягкие формулировки там не помогают. */
const TERMS = [
  'Наименования, описания и иные тексты принадлежат своим авторам и воспроизводятся со ссылкой на источник. Сведения об авторе описания публикуются на странице источника.',
  'Видеоматериал предоставляется сторонними сервисами, не связанными с AniMori и не являющимися правообладателями: лицензий на него программа не получает, не размещает, не хранит и не копирует его и прав на распространение не имеет.',
  'Источники программой не проверяются: законность, содержимое и доступность не гарантируются. Плеер лишь открывает адрес потока выбранного человека — за выбор источника, за просмотр и за его законность в своей юрисдикции отвечает пользователь.',
  'AniMori не является продуктом AniList, не связан с ним и не одобрен им. Пользовательские списки хранятся на устройстве и в AniList не передаются.',
  'Материалы возрастного ограничения по умолчанию скрыты; их отображение включается настройкой «Взрослое содержимое».',
  'Код распространяется по лицензии MIT, перечень зависимостей и их лицензий приведён в THIRD-PARTY.md. Данные датасета animori-data публикуются по CC0-1.0.',
]

/** Правовые документы: полные тексты живут в репозитории. */
const DOCS = [
  {
    name: 'Политика обработки персональных данных',
    url: 'https://github.com/foulnike/Animori/blob/main/docs/PRIVACY.md',
  },
  {
    name: 'Условия использования',
    url: 'https://github.com/foulnike/Animori/blob/main/docs/TERMS.md',
  },
]

function onClose(): void {
  open.value = false
}

/** Открыть правовой документ: внешний адрес — только через оболочку. */
function onDoc(url: string): void {
  void Bridge.shell.openExternal(url)
}

/// Сколько прокручивать за нажатие. Шестьдесят пикселей — примерно две строки: с трёх метров видно, что текст поехал.
const STEP = 60

/** Клавиши внутри окна: Esc закрывает, стрелки листают. Листаем сами, а не отдаём обходу пульта:
 *  фокус стоит на теле текста, и обход его предком не считает. */
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    onClose()
    return
  }

  const box = body.value
  if (box === null) return

  let step: number
  if (e.key === 'ArrowDown') step = STEP
  else if (e.key === 'ArrowUp') step = -STEP
  else if (e.key === 'PageDown') step = STEP * 4
  else if (e.key === 'PageUp') step = -STEP * 4
  else return

  e.preventDefault()
  e.stopPropagation()
  box.scrollBy({ top: step, behavior: 'smooth' })
}

// Шаг «Назад» ставится только на время окна: оно открывается поверх окна настроек, и без своей
// записи аппаратная кнопка снимала бы оба окна разом, а закрывается последнее поставленное.
let stopBack: (() => void) | null = null

watch(open, (isOpen) => {
  if (!isOpen) {
    document.removeEventListener('keydown', onKey)
    stopBack?.()
    stopBack = null
    return
  }

  document.addEventListener('keydown', onKey)

  if (stopBack === null) {
    stopBack = pushBackStop(function () {
      onClose()
      return true
    })
  }

  // Фокус переезжает в текст. Без этого он остался бы на кнопке под окном: обход пульта ограничил бы
  // себя окном, а фокус стоял снаружи, и первое нажатие стрелки ушло бы в никуда.
  void nextTick(() => body.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  stopBack?.()
  stopBack = null
})
</script>
<template>
  <div class="am-credits">
    <p class="am-credits__lead">
      Откуда берутся названия и описания, и на каких условиях программа их показывает.
    </p>

    <button class="am-credits__btn" type="button" @click="open = true">Источники и права</button>

    <Teleport to="body">
      <div
        v-if="open"
        class="am-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Источники и права"
      >
        <!-- Клик мимо закрывает: это справка, держать её силой незачем. -->
        <div class="am-modal__veil" @click="onClose" />

        <div class="am-modal__box">
          <div class="am-modal__head">
            <h3 class="am-modal__title">Источники и права</h3>
            <button class="am-modal__x" type="button" aria-label="Закрыть" @click="onClose">
              ✕
            </button>
          </div>

          <!-- tabindex у тела: с фокусом на нём пульт видит, что находится внутри окна, и не считает окно пустым. -->
          <div ref="body" class="am-modal__body" tabindex="0" data-am-seed>
            <h4 class="am-modal__h">Откуда данные</h4>
            <ul>
              <li v-for="source in SOURCES" :key="source.name">
                <b>{{ source.name }}</b> — {{ source.what }}
              </li>
            </ul>

            <h4 class="am-modal__h">Оговорки</h4>
            <ul>
              <li v-for="term in TERMS" :key="term">{{ term }}</li>
            </ul>

            <div class="am-modal__warn">
              Ссылки на видео ведут на сторонние сервисы, не связанные с AniMori. Программа ничего
              не скачивает, не хранит и не копирует, лицензии на видеоматериал не получает, прав на
              его распространение не имеет, источники не проверяет и за содержимое не отвечает.
            </div>

            <!-- Правовые документы: на приставке браузера нет — адрес показывается текстом. -->
            <h4 class="am-modal__h">Правовые документы</h4>
            <ul>
              <li v-for="doc in DOCS" :key="doc.url">
                <button v-if="outside" class="am-modal__link" type="button" @click="onDoc(doc.url)">
                  {{ doc.name }}
                </button>
                <template v-else>{{ doc.name }} — {{ doc.url }}</template>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<style scoped>
/* Модалка на весь экран: сама справка узкая, но подложка обязана перекрыть всё, иначе клик мимо уходит в панель под ней. */
.am-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
}

/* Подложка красится темой, а не чёрным литералом: на светлой теме чёрная вуаль читалась провалом в экран. */
.am-modal__veil {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--am-bg) 76%, transparent);
  backdrop-filter: blur(var(--am-blur-strong));
}

.am-modal__box {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(640px, 100%);
  max-height: min(760px, 88vh);
  background: var(--am-panel-2);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-m);
  box-shadow: var(--am-sh-2);
  animation: am-modal-in var(--am-mid) var(--am-ease) both;
}

@keyframes am-modal-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.am-modal__head {
  display: flex;
  flex: none;
  gap: 12px;
  align-items: center;
  padding: 15px 15px 13px 18px;
  border-bottom: 1px solid var(--am-line-soft);
}

.am-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--am-text);
}

.am-modal__x {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease);
}

.am-modal__x:hover:where(:not(.am-lite *)) {
  color: var(--am-text);
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
}

/* Текст прокручивается внутри рамки. `min-height: 0` обязателен: в гибкой колонке блок по
   умолчанию не сжимается ниже содержимого, и `overflow-y` не даёт ничего — рамка уходит за экран. */
.am-modal__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 11px;
  min-height: 0;
  padding: 16px 18px 20px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
  color: var(--am-dim);
}

/* Тело берёт фокус, но подсветки на нём быть не должно: правило `.am-lite :focus-visible` залило бы
   акцентом всю страницу текста — это читалось бы не «здесь ты», а «здесь сломано». */
.am-modal__body:focus-visible {
  outline: none;
  box-shadow: none;
}

/* Имя источника — тем же приёмом, что и в справке про перенос: выделяет, к чему относится
   описание, иначе строка сливается в одну полосу. */
.am-modal__body b {
  color: var(--am-text);
}

.am-modal__h {
  margin: 7px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--am-text);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Списки — колонкой с промежутком, как в справке: список читают по строке, и разрядка между
   строками важнее плотности. */
.am-modal__body ol,
.am-modal__body ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}

/* Ссылка-кнопка правового документа: тот же приём, что в справке про облако. */
.am-modal__link {
  padding: 0;
  font: inherit;
  color: var(--am-accent);
  cursor: pointer;
  background: none;
  border: 0;
}

/* Короткое предупреждение — рамкой, теми же средствами, что и в справке: в отличие от оговорок его
   читают не подряд, а замечают глазом. */
.am-modal__warn {
  padding: 11px 13px;
  background: color-mix(in srgb, var(--am-warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--am-warn) 42%, transparent);
  border-radius: var(--am-r-m);
}

@media (prefers-reduced-motion: reduce) {
  .am-modal__box {
    animation: none;
  }
}

/* --- Кнопка в окне настроек --- */

/* Подвал плитки «О программе». Линия сверху — тем же приёмом, что на ПК: факты о сборке
   разведены со справкой, и кнопка не прилипает к подводной строке. Раньше блок стоял без
   вёрстки — промежуток давал только интерлиньяж, и кнопка слипалась с текстом; колонка с
   промежутком возвращает ему вид подвала, а не продолжения абзаца. */
.am-credits {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--am-line-soft);
}

.am-credits__lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--am-dim);
}

/* Кнопка остаётся по ширине содержимого: во флекс-колонке она иначе растянулась бы
   на всю панель и читалась как полоса, а не как действие. */
.am-credits__btn {
  align-self: flex-start;
  padding: 8px 13px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--am-text);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-s);
  transition:
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease);
}

.am-credits__btn:hover:where(:not(.am-lite *)) {
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
}
</style>
