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
  const previous = root.querySelector<HTMLButtonElement>('[aria-label="Предыдущий слайд"]')!
  const heading = () => root.querySelector('h1')?.textContent
  expect(previous.disabled).toBe(true)
  expect(previous.querySelector('svg')).not.toBeNull()
  expect(next.getAttribute('aria-label')).toBe('Следующий слайд')
  expect(next.querySelector('svg')).not.toBeNull()
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
  expect(previous.disabled).toBe(false)
  next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  expect(document.activeElement).toBe(next)
  expect(root.querySelector('.am-intro__feature-art button')).toBeNull()
  expect(runBackStop()).toBe(true)
  await nextTick()
  expect(heading()).toBe('Добро пожаловать в AniMori!')

  for (const title of [
    'Смотрите аниме',
    'Ведите свой список',
    'Переносите списки',
    'Восстановите список',
    'Источники данных',
    'Условия использования',
  ]) {
    next.click()
    await nextTick()
    expect(heading()).toBe(title)
    if (title === 'Ведите свой список') {
      expect(root.querySelector('.am-scene')?.getAttribute('data-scene')).toBe('lists')
    }
    if (title === 'Восстановите список') {
      expect(root.querySelectorAll('[data-cloud-route]')).toHaveLength(1)
      expect(root.querySelector('[data-cloud-route]')?.getAttribute('data-cloud-route')).toBe(
        'restore',
      )
      expect(root.querySelectorAll('[data-cloud-device]')).toHaveLength(1)
    }
    if (title === 'Переносите списки') {
      expect(root.querySelector('.am-intro__copy')?.textContent).toContain('из профиля Шикимори')
      expect(root.querySelector('[data-import-source="profile"]')).not.toBeNull()
    }
  }
  expect(indicator.getAttribute('aria-valuenow')).toBe('7')
  expect(document.querySelector('.am-credits__code')).toBeNull()
  expect(root.querySelector('a')).toBeNull()
  expect(next.disabled).toBe(true)
  next.click()
  expect(heading()).toBe('Условия использования')

  const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  expect(document.activeElement).toBe(checkbox)
  checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  const credits = root.querySelector<HTMLButtonElement>('.am-credits__btn')!
  expect(document.activeElement).toBe(credits)
  credits.click()
  await nextTick()
  const dialog = document.querySelector('[role="dialog"][aria-label="Источники и права"]')!
  expect(dialog.querySelector('a')).toBeNull()
  dialog.querySelector<HTMLButtonElement>('[aria-label="Следующая страница"]')!.click()
  await nextTick()
  const documents = dialog.querySelectorAll<HTMLButtonElement>('.am-credits__documents button')
  expect(documents).toHaveLength(2)
  for (const documentButton of documents) {
    documentButton.focus()
    documentButton.click()
    await nextTick()
    expect(document.querySelector('.am-credits__code img')).not.toBeNull()
    expect(runBackStop()).toBe(true)
    await nextTick()
    expect(document.querySelector('.am-credits__code img')).toBeNull()
  }
  expect(next.disabled).toBe(true)
  expect(runBackStop()).toBe(true)
  await nextTick()
  expect(heading()).toBe('Условия использования')
  await vi.waitFor(() => expect(document.activeElement).toBe(credits))
  credits.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
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
