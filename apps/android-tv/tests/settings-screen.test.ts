import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AppRoot from '@/app/App.vue'
import { seen } from '@/app/see-tile'
import { tip } from '@/app/tip'
import { Bridge } from '@/bridge'
import { loadSettings, settings } from '@/core/settings'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

const initialSettings = { ...settings }
const errors: unknown[] = []
let app: App
let host: HTMLDivElement

function clickButton(scope: ParentNode, selector: string, title: string): void {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>(selector)).find(
    (item) => item.textContent.trim() === title,
  )
  if (!button) throw new Error(`Кнопка «${title}» отсутствует`)
  button.click()
}

async function openSettings(): Promise<void> {
  clickButton(host, '.am-side__item', 'Настройки')
  await vi.waitFor(() => {
    expect(errors).toEqual([])
    expect(host.querySelectorAll('.am-door')).toHaveLength(6)
  })
}

async function openTagRules(): Promise<HTMLButtonElement> {
  clickButton(host, '.am-door', 'Оформление')
  await nextTick()
  const increase = document.querySelector<HTMLButtonElement>(
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
  errors.length = 0
  vi.unstubAllGlobals()
  resetMockBridge()
})

describe('настройки Android TV', () => {
  it('открывает плитки и сохранённые правила в WebView без structuredClone', async () => {
    vi.stubGlobal('structuredClone', undefined)
    app.mount(host)

    await openSettings()
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
})
