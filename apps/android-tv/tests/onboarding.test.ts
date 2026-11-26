import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { runBackStop } from '@/app/back-stop'
import { assets } from '@/app/onboarding'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'
import { needsOnboarding } from '../../../packages/onboarding/src/first-launch'
import Onboarding from '../../../packages/onboarding/src/Onboarding.vue'

let app: App | undefined

beforeEach(() => {
  installMockBridge()
})

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  resetMockBridge()
})

it('при первом включении ведёт с пульта через документы и сохраняет завершение', async () => {
  const root = document.createElement('div')
  document.body.append(root)
  const complete = vi.fn()
  app = createApp({ render: () => h(Onboarding, { ...assets, onComplete: complete }) })
  expect(await needsOnboarding()).toBe(true)
  app.mount(root)

  const next = root.querySelector<HTMLButtonElement>('.am-intro__next')!
  const heading = () => root.querySelector('h1')?.textContent
  expect(document.activeElement).toBe(next)
  next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  expect(document.activeElement).toBe(next)
  expect(root.querySelector('.am-intro__scroll')?.hasAttribute('tabindex')).toBe(false)
  const indicator = root.querySelector('[role="progressbar"]')!
  expect(indicator.children).toHaveLength(8)
  expect(indicator.getAttribute('aria-valuenow')).toBe('1')
  expect(runBackStop()).toBe(false)

  next.click()
  await nextTick()
  expect(heading()).toBe('Смотрите аниме')
  expect(runBackStop()).toBe(true)
  await nextTick()
  expect(heading()).toBe('Добро пожаловать в AniMori!')

  for (const title of [
    'Смотрите аниме',
    'Ведите свой список',
    'Переносите списки',
    'Восстанавливайте список из облака',
    'Наши провайдеры',
    'Условия использования',
  ]) {
    next.click()
    await nextTick()
    expect(heading()).toBe(title)
    if (title === 'Ведите свой список')
      expect(root.querySelector('.am-intro__gallery-nav')).toBeNull()
    if (title === 'Переносите списки') {
      expect(root.querySelector('.am-intro__copy')?.textContent).toContain('из профиля Шикимори')
    }
  }
  expect(indicator.getAttribute('aria-valuenow')).toBe('7')
  expect(root.querySelectorAll('.am-intro__qr-documents img')).toHaveLength(2)
  expect(root.querySelector('a')).toBeNull()
  expect(next.disabled).toBe(true)
  next.click()
  expect(heading()).toBe('Условия использования')

  const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  expect(document.activeElement).toBe(checkbox)
  checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await nextTick()
  expect(checkbox.checked).toBe(true)
  expect(next.disabled).toBe(false)
  checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement).toBe(next)
  next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  expect(document.activeElement).toBe(checkbox)
  checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  next.click()
  await nextTick()
  expect(heading()).toBe('Приятного пользования!')
  expect(root.querySelector('.am-intro__qr-repository img')).not.toBeNull()

  next.click()
  await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce())
  expect(await needsOnboarding()).toBe(false)
})
