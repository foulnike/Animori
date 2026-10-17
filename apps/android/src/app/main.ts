// Точка входа своего клиента (режим сборки app): разметка своя и готова сразу.

import { createApp } from 'vue'
import App from './App.vue'
import { startAppearance } from './appearance'
import { seen } from './see-tile'
import { tip } from './tip'
import { startDpad } from './dpad'
import { isWeakPlatform, markPlatform } from './platform'
import { startUpdateCheck } from './update'
import { initCollection } from '@/core/collection'
import { initDatasetNames, updateDatasetNamesInBackground } from '@/core/dataset-names'
import { loadSettings } from '@/core/settings'
import { installGlobalErrorHandlers } from '@/utils/logger'
import { initSplash } from './splash'

// Стиль всплывающих подписей: плашка живёт в body, и scoped-правила
// компонентов до неё не достают.
import './styles/tip.css'

// Корень лежит в нашем же index.html: если его нет, разметка разошлась с кодом — молчать об этом вредно.
const root = document.getElementById('app')
if (!root) throw new Error('AniMori: корень #app не найден в index.html')

// До первой отрисовки: класс нужен на <html> раньше, чем браузер начнёт считать стили.
markPlatform()

// Пульт: на десктопе не нужен — там стрелками крутят страницу.
if (isWeakPlatform()) startDpad()

/// Снимает заставку из index.html: она стоит отдельным узлом рядом с корнем, а Vue не стирает содержимое корня,
/// а дописывает своё — знак висел бы под окном. Снимается сразу после монтирования, до него — нельзя.
function hideBoot(): void {
  document.getElementById('boot')?.remove()
}

/// Настройки поднимаются до первой отрисовки: от них зависит отбор 18+ и источник названий; ошибок `loadSettings`
/// не бросает — без хранилища остаются дефолты. Коллекция идёт после монтирования, датасет — фоном.
async function start(): Promise<void> {
  // Настройки поднимаются до первой отрисовки: от них зависит отбор 18+ и источник названий; ошибок `loadSettings`
  // не бросит — без хранилища остаются дефолты. Коллекция идёт после монтирования, датасет — фоном.
  await Promise.all([loadSettings(), initSplash().catch(() => undefined)])

  // Тема ставится до первой отрисовки: светлое окно, темнеющее на глазах, читается как поломка.
  startAppearance()

  // Перехватчики ставятся до первой отрисовки и после настроек: тумблер журнала должен быть прочтён.
  installGlobalErrorHandlers()

  // Подписи v-tip и v-seen регистрируются на всё приложение: импорт в каждый файл был бы шумом,
  // а у наблюдателя показа плитки один на всё окно — место ему тоже здесь.
  createApp(App)
    .directive('tip', tip)
    .directive('seen', seen)
    .mount(root as HTMLElement)

  hideBoot()

  // Ошибка подъёма окно не роняет: список просто останется пустым до первого действия, причина уйдёт в журнал.
  try {
    await initCollection()
  } catch (e: unknown) {
    console.error('AniMori: список не поднялся из снимка', e)
  }

  void initDatasetNames()
  updateDatasetNamesInBackground()

  // Сверка версии — только на приставке: установку оттуда отдаёт системе оболочка,
  // а на компьютере того же моста нет. Неудача проверки ничему не мешает.
  if (isWeakPlatform()) void startUpdateCheck()
}

void start()
