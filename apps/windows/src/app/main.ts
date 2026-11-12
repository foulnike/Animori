// Точка входа своего клиента (режим сборки app). Отличие от скрипта: разметка своя и готова сразу, ждать нечего.

import { createApp } from 'vue'
import App from './App.vue'
import { startAppearance } from './appearance'
import { systemName } from './host'
import { seen } from './see-tile'
import { initSplash } from './splash'
import { tip } from './tip'
import { eachEntry, initCollection } from '@/core/collection'
import { initDatasetNames, updateDatasetNamesInBackground } from '@/core/dataset-names'
import { hydrateLooks, peekLook, warmLooks } from '@/core/media-looks'
import { loadCoversFromStore, prefetchCovers, type CoverPair } from '@/core/posters'
import { loadSettings, settings } from '@/core/settings'
import { installGlobalErrorHandlers, Logger, setLogEnabled } from '@/utils/logger'

// Стиль всплывающих подписей: плашка живёт в body, и scoped-правила
// компонентов до неё не достают.
import './styles/tip.css'

// Корень обязан существовать: он лежит в нашем же index.html. Если его нет, разметка разошлась с кодом — молчать об этом вредно.
const root = document.getElementById('app')
if (!root) throw new Error('AniMori: корень #app не найден в index.html')

/** Снимает заставку index.html сразу после монтирования: раньше нельзя — Vue дописывает своё, не стирая. */
function hideBoot(): void {
  document.getElementById('boot')?.remove()
}

/** Обложки своей полки: сперва то, что уже лежит на диске, затем догрузка недостающего фоном.
 * Второй шаг намеренно не ждётся: первый запуск тянет десятки мегабайт, и заставка столько не ждёт. */
async function warmListCovers(): Promise<void> {
  await loadCoversFromStore()

  const ids: number[] = []
  for (const entry of eachEntry()) ids.push(entry.mediaId)
  if (ids.length === 0) return

  // Адреса обложек лежат в складе обликов, а не в снимке: без этого шага догружать было бы нечего.
  await hydrateLooks(ids)
  // Поднимаем метки 18+ для всей коллекции, а не только первой сотни строк.
  await warmLooks(ids)

  const pairs: CoverPair[] = []
  for (const mediaId of ids) {
    const url = peekLook(mediaId)?.cover
    if (url) pairs.push({ mediaId, url })
  }

  if (pairs.length > 0) await prefetchCovers(pairs)
}

/**
 * Настройки и надпись плашки — до первой отрисовки, коллекция — после монтирования (список односторонний), датасет фоном.
 */
async function start(): Promise<void> {
  // Круг сплэшей читается и записывается здесь же: ход круга обязан лечь в хранилище ДО показа, иначе спам перезагрузки (F5) показывал бы одну и ту же надпись.
  await Promise.all([loadSettings(), initSplash()])

  // Журнал узнаёт, писать ли, только отсюда: сам он настройки не видит, иначе кольцо модулей.
  setLogEnabled(settings.enableLogger)

  // Тема ставится до первой отрисовки и сразу после настроек: светлое окно, темнеющее на глазах, читается как поломка, а не как выбор оформления.
  startAppearance()

  // Запись о запуске: версия и система — первое, что нужно тому, кому прислали журнал.
  Logger('INFO', 'Запуск программы', { version: __ANIMORI_VERSION__, platform: systemName() })

  // Перехватчики ставятся до первой отрисовки: сбой монтирования — тоже событие для журнала. Флага им не нужно — пишет ли журнал, решает он сам.
  installGlobalErrorHandlers()

  // Подписи v-tip и v-seen регистрируются на всё приложение: их просят метки плиток, кнопки шапок и полки карточек. У каждой один наблюдатель на всё окно, место ей здесь же.
  const app = createApp(App)

  // Ошибка в разметке или в обработчике мимо журнала не доходит: Vue печатает её себе в консоль и идёт дальше, а сломанный экран приходит в issue совсем без записей.
  app.config.errorHandler = (e, _instance, info) => {
    Logger('ERROR', `Ошибка во Vue (${info})`, e)
  }
  app.config.warnHandler = (message, _instance, trace) => {
    Logger('WARN', `Предупреждение Vue: ${message}`, trace)
  }

  app
    .directive('tip', tip)
    .directive('seen', seen)
    .mount(root as HTMLElement)

  hideBoot()

  // Ошибка подъёма окно не роняет — список просто останется пустым до первого действия, а причина уйдёт в журнал.
  try {
    await initCollection()
  } catch (e: unknown) {
    Logger('ERROR', 'Список не поднялся из снимка', e)
  }

  void initDatasetNames()
  updateDatasetNamesInBackground()

  // Постеры своей полки — после снимка и обликов, потому что адреса лежат там. Ошибка не роняет старт: без картинок приложение работает, просто сетка без сети останется пустой.
  void warmListCovers().catch((e: unknown) => {
    Logger('ERROR', 'Постеры своей полки не поднялись', e)
  })
}

void start()
