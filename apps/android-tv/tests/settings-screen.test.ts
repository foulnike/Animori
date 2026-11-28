import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AppRoot from '@/app/App.vue'
import { startAppearance } from '@/app/appearance'
import { seen } from '@/app/see-tile'
import { tip } from '@/app/tip'
import { Bridge } from '@/bridge'
import * as collection from '@/core/collection'
import { loadSettings, settings } from '@/core/settings'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

const initialSettings = { ...settings }
const errors: unknown[] = []
let app: App
let host: HTMLDivElement

function clickButton(scope: ParentNode, selector: string, title: string): void {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>(selector)).find((item) => {
    const label = item.getAttribute('aria-label')
    if (label !== null) return label === title

    const copy = item.cloneNode(true) as HTMLButtonElement
    copy.querySelectorAll('[aria-hidden="true"]').forEach((decoration) => decoration.remove())
    return copy.textContent.trim() === title
  })
  if (!button) throw new Error(`Кнопка «${title}» отсутствует`)
  button.focus()
  button.click()
}

function dialog(title: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${title}"]`)
  if (!found) throw new Error(`Окно «${title}» отсутствует`)
  return found
}

async function back(): Promise<void> {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  await nextTick()
  await nextTick()
}

async function openSettings(): Promise<void> {
  clickButton(host, '.am-side__item', 'Настройки')
  await vi.waitFor(() => {
    expect(errors).toEqual([])
    expect(host.querySelectorAll('.am-door')).toHaveLength(7)
  })
}

async function openTagRules(): Promise<HTMLButtonElement> {
  clickButton(host, '.am-door', 'Контент 18+')
  await nextTick()
  clickButton(dialog('Контент 18+'), 'button', 'Настроить теги')
  await nextTick()
  const increase = dialog('Настройка тегов').querySelector<HTMLButtonElement>(
    '.am-adult-tag__step[aria-label="Увеличить порог: Инцест"]',
  )
  if (!increase) throw new Error('Кнопка изменения порога отсутствует')
  return increase
}

beforeEach(async () => {
  const { bridge } = installMockBridge()
  await bridge.storage.set('set_adult_mode', 'partial')
  await bridge.storage.set('set_adult_age_verified', true)
  await bridge.storage.set('set_adult_tag_rules', {
    Incest: { threshold: 55, hideInPartial: true },
  })
  await loadSettings()
  startAppearance()

  window.history.replaceState(null, '', '#/history')
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(AppRoot)
  app.directive('tip', tip)
  app.directive('seen', seen)
  app.config.errorHandler = (error) => errors.push(error)
})

afterEach(() => {
  app.unmount()
  host.remove()
  window.history.replaceState(null, '', window.location.pathname)
  Object.assign(settings, initialSettings)
  startAppearance()
  errors.length = 0
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetMockBridge()
})

describe('настройки Android TV', () => {
  it('открывает настройки 18+ и ставит фокус на выбранный режим по прямому адресу', async () => {
    window.history.replaceState(null, '', '#/settings/adult')
    app.mount(host)

    await vi.waitFor(() => {
      const mode = document.querySelector('.am-adult-mode--active')
      expect(mode).not.toBeNull()
      expect(mode?.closest('[role="dialog"]')?.getAttribute('aria-label')).toBe('Контент 18+')
      expect(document.activeElement).toBe(mode)
      expect(errors).toEqual([])
    })
  })

  it('открывает плитки и сохранённые правила в WebView без structuredClone', async () => {
    vi.stubGlobal('structuredClone', undefined)
    app.mount(host)

    await openSettings()
    clickButton(host, '.am-door', 'Оформление')
    await nextTick()
    const look = document.querySelector('[role="dialog"][aria-label="Оформление"]')
    expect(look).not.toBeNull()
    expect(look?.querySelector('.am-adult-control')).toBeNull()
    await back()
    const increase = await openTagRules()
    expect(increase.closest('.am-adult-tag')?.querySelector('output')?.textContent).toBe('55%')
  })

  it('открывается повторно после сохранения правила и показывает новый порог', async () => {
    app.mount(host)
    await openSettings()
    const increase = await openTagRules()
    increase.click()
    await nextTick()
    expect(settings.adultTagRules.Incest).toEqual({ threshold: 60, hideInPartial: true })
    expect(await Bridge.storage.get('set_adult_tag_rules')).toMatchObject({
      Incest: { threshold: 60, hideInPartial: true },
    })

    clickButton(host, '.am-side__item', 'История')
    await vi.waitFor(() => {
      expect(host.querySelector('.am-side__item--on')?.textContent?.trim()).toBe('История')
      expect(host.querySelector('.am-door')).toBeNull()
    })
    await openSettings()
    const reopened = await openTagRules()
    expect(reopened.closest('.am-adult-tag')?.querySelector('output')?.textContent).toBe('60%')
  })

  it('перелистывает правила, возвращает фокус и убирает пояснения в режиме «Скрыто»', async () => {
    app.mount(host)
    await openSettings()
    await openTagRules()

    const tags = dialog('Настройка тегов')
    expect(tags.querySelectorAll('.am-adult-tag')).toHaveLength(3)
    expect(tags.querySelector('[aria-label="Предыдущая страница"]:disabled svg')).not.toBeNull()
    clickButton(tags, 'button', 'Следующая страница')
    await nextTick()
    expect(tags.querySelector('.am-settings-window__page')?.textContent).toContain('2 из')
    expect(tags.textContent).not.toContain('Инцест')

    await back()
    expect(document.activeElement?.textContent?.trim()).toBe('Настроить теги')
    const adult = dialog('Контент 18+')
    expect(adult.querySelectorAll('.am-adult-note .am-adult-chip')).toHaveLength(2)
    expect(
      Array.from(
        adult.querySelectorAll('.am-adult-control .am-adult-chip'),
        (chip) => chip.className,
      ),
    ).toEqual([
      'am-adult-chip am-adult-chip--muted',
      'am-adult-chip am-adult-chip--blue',
      'am-adult-chip am-adult-chip--red',
    ])
    clickButton(adult, 'button', 'Скрыто')
    await nextTick()
    expect(adult.querySelector('.am-adult-note')).toBeNull()
    expect(adult.textContent).not.toContain('Настроить теги')

    await back()
    expect(document.activeElement?.getAttribute('data-door')).toBe('adult')
  })

  it('выбирает палитру и скин независимо', async () => {
    app.mount(host)
    await openSettings()
    clickButton(host, '.am-door', 'Оформление')
    await nextTick()
    const look = dialog('Оформление')

    expect(
      Array.from(look.querySelectorAll('.am-skins__mark'), (mark) => mark.textContent),
    ).toEqual(['◐', '☀', '⬤'])
    clickButton(look, '.am-family__btn', 'Lain')
    clickButton(look, '.am-skins__btn', 'Светлая')
    await nextTick()
    expect(document.documentElement.dataset.amSkin).toBe('light')
    expect(document.documentElement.dataset.amFamily).toBe('lain')

    clickButton(look, '.am-family__btn', 'Стандартная')
    await nextTick()
    expect(document.documentElement.dataset.amSkin).toBe('light')
    expect(document.documentElement.dataset.amFamily).toBe('standard')
  })

  it('показывает отчёт о переносе отдельно и сохраняет список пропущенных названий', async () => {
    vi.spyOn(collection, 'pullFromShikimori').mockResolvedValue({
      nick: 'demo',
      mode: 'merge',
      read: 7,
      matched: 2,
      lost: 5,
      lostTitles: ['Первый', 'Второй', 'Третий', 'Четвёртый'],
      dated: 1,
      total: 2,
      added: 2,
      updated: 0,
      kept: 0,
      onlyHere: 0,
    })
    app.mount(host)
    await openSettings()
    clickButton(host, '.am-door', 'Импорт списка')
    await nextTick()
    const importer = dialog('Импорт списка')
    const nick = importer.querySelector<HTMLInputElement>('input')
    if (!nick) throw new Error('Поле имени пользователя отсутствует')
    nick.value = 'demo'
    nick.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    clickButton(importer, 'button', 'Перенести список')
    await nextTick()
    clickButton(dialog('Перенос с Шикимори'), 'button', 'Дополнить список')
    await vi.waitFor(() =>
      expect(dialog('Отчёт о переносе').textContent).toContain('Без соответствия'),
    )
    const report = dialog('Отчёт о переносе')
    clickButton(report, 'button', 'Следующая страница')
    await nextTick()
    expect(report.textContent).toContain('Первый')
    clickButton(report, 'button', 'Следующая страница')
    await nextTick()
    expect(report.textContent).toContain('Четвёртый')
    expect(report.querySelector('[aria-label="Следующая страница"]:disabled svg')).not.toBeNull()
    expect(report.textContent).toContain('Других записей без соответствия: 1')
    await back()
    clickButton(importer, 'button', 'Последний отчёт')
    await nextTick()
    expect(dialog('Отчёт о переносе').textContent).toContain('1 из 3')
  })

  it('показывает результат проверки прокси и состояние при запуске в одном окне', async () => {
    vi.mocked(Bridge.proxyDiagnostics.status).mockResolvedValue({
      outcome: 'off',
      server: '',
      hasCredentials: false,
      auth: 'none',
    })
    const probe = vi.mocked(Bridge.proxyDiagnostics.probe).mockResolvedValue({
      outcome: 'invalid',
      server: '',
      reachable: false,
      latencyMs: 0,
    })
    app.mount(host)
    await openSettings()
    clickButton(host, '.am-door', 'Прокси')
    await nextTick()
    const proxy = dialog('Прокси')
    expect(
      Array.from(proxy.querySelectorAll('button'), (button) => button.textContent.trim()),
    ).not.toContain('Состояние')
    clickButton(proxy, 'button', 'Проверить прокси')
    await vi.waitFor(() => {
      const result = dialog('Проверка прокси')
      expect(result.textContent).toContain('Проверьте адрес и порт')
      expect(result.textContent).toContain('Состояние при запуске')
      expect(result.textContent).toContain('трафик идёт напрямую')
    })
    expect(probe).toHaveBeenCalledTimes(1)
    await back()
    expect(document.activeElement?.textContent?.trim()).toBe('Проверить прокси')
  })
})
