// Тема — атрибутом data-am-skin на корне документа: фон окна и скроллбары задаются выше
// любого экрана. Подписи тем здесь, а не в labels.ts: там слова предметной области.

import { ref } from 'vue'

import { type AppearanceName, saveSetting, settings, type VisualTheme } from '@/core/settings'

interface AppearanceOption {
  name: AppearanceName
  title: string
  /** Знак для переключателя в шапке: три слова там шумели бы громче заголовка. */
  mark: string
  /** Поле обязательное: у необязательного подсказка новой темы молча пропадала бы. */
  hint: string
}

export const APPEARANCES: ReadonlyArray<AppearanceOption> = [
  { name: 'dark', title: 'Тёмная', mark: '◐', hint: 'Тёмная: обычный вид приложения' },
  { name: 'light', title: 'Светлая', mark: '☀', hint: 'Светлая: для дневного света' },
  { name: 'amoled', title: 'AMOLED', mark: '⬤', hint: 'AMOLED: чёрный фон, экономит заряд' },
]

export const appearance = ref<AppearanceName>(settings.appearance)
export const visualTheme = ref<VisualTheme>(settings.visualTheme)

function applyAppearance(name: AppearanceName): void {
  document.documentElement.dataset.amSkin = name
  document.documentElement.dataset.amFamily = visualTheme.value
}

/** Зовётся до первой отрисовки: смена фона на глазах читается поломкой. */
export function startAppearance(): void {
  appearance.value = settings.appearance
  visualTheme.value = settings.visualTheme
  applyAppearance(settings.appearance)
}

export function setVisualTheme(name: VisualTheme): void {
  visualTheme.value = name
  document.documentElement.dataset.amFamily = name
  void saveSetting('visualTheme', 'am_visual_theme', name)
}

/** Запись в хранилище не ждём: тему меняют по свету в комнате. */
export function setAppearance(name: AppearanceName): void {
  appearance.value = name
  applyAppearance(name)
  void saveSetting('appearance', 'am_appearance', name)
}
