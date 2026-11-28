import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installMockBridge, type MockBridgeHandle } from '@core-tests/bridge-module'
import { assets } from '@/app/onboarding'
import { DOCUMENTS } from '../../../packages/onboarding/src/legal'
import { needsOnboarding } from '../../../packages/onboarding/src/first-launch'
import { showOnboarding } from '../../../packages/onboarding/src/launch'

let mock: MockBridgeHandle

beforeEach(() => {
  mock = installMockBridge()
})

describe('первый запуск AniMori', () => {
  it('пропускает знакомство у прежней установки', async () => {
    await mock.bridge.storage.set('am_splash_round', { rest: [2, 1], last: 0 })
    expect(await needsOnboarding()).toBe(false)
  })

  it('показывает анимированные сцены, требует согласие и закрывается после сохранения', async () => {
    const root = document.createElement('div')
    const shown = vi.fn()
    const write = vi.spyOn(mock.bridge.storage, 'set').mockRejectedValueOnce(new Error('disk'))
    expect(await needsOnboarding()).toBe(true)

    const completed = showOnboarding(root, assets, shown)
    const next = root.querySelector<HTMLButtonElement>('.am-intro__next')!
    const heading = () => root.querySelector('h1')?.textContent
    expect(shown).toHaveBeenCalledOnce()
    expect(heading()).toBe('Добро пожаловать в AniMori!')
    expect(root.textContent).toContain('Спасибо, что скачали приложение!')
    expect(root.textContent).toContain(
      'Здесь можно найти и смотреть аниме, а также вести свой список.',
    )
    expect(root.querySelector('.am-intro-sakura')?.getAttribute('aria-hidden')).toBe('true')
    next.click()
    await nextTick()
    expect(heading()).toBe('Смотрите аниме')
    expect(root.querySelector('.am-intro__copy > p:not(.am-intro__label)')?.textContent).toBe(
      'Продолжайте с того места, где остановились.',
    )
    const scene = () => root.querySelector<HTMLElement>('.am-scene')!
    expect(scene().dataset.scene).toBe('player')
    expect(root.querySelector('.am-intro__feature-art button')).toBeNull()

    for (const name of ['lists', 'transfer', 'cloud']) {
      next.click()
      await nextTick()
      expect(scene().dataset.scene).toBe(name)
      expect(scene().querySelector('img')).toBeNull()
    }
    expect(scene().querySelectorAll('[data-cloud-route]')).toHaveLength(2)
    expect(scene().querySelectorAll('[data-cloud-device]')).toHaveLength(2)

    next.click()
    await nextTick()
    expect(heading()).toBe('Источники данных')
    next.click()
    await nextTick()
    expect(heading()).toBe('Политика и условия')
    expect(next.disabled).toBe(true)
    expect(await needsOnboarding()).toBe(true)

    const documents = [...root.querySelectorAll<HTMLAnchorElement>('.am-intro__documents a')]
    expect(documents.map((link) => link.getAttribute('href'))).toEqual(
      DOCUMENTS.map((doc) => doc.url),
    )
    expect(root.textContent).not.toContain('Источники и права')
    for (const [index, link] of documents.entries()) {
      link.click()
      expect(mock.bridge.shell.openExternal).toHaveBeenLastCalledWith(DOCUMENTS[index]?.url)
    }
    expect(next.disabled).toBe(true)
    const consent = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    consent.checked = true
    consent.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(next.disabled).toBe(false)
    next.click()
    await nextTick()
    expect(heading()).toBe('Приятного пользования!')
    expect(root.querySelector('.am-intro__joke img')).not.toBeNull()

    next.click()
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull())
    expect(heading()).toBe('Приятного пользования!')
    expect(await needsOnboarding()).toBe(true)

    next.click()
    await completed
    expect(write).toHaveBeenLastCalledWith('am_onboarding_completed', true)
    expect(await needsOnboarding()).toBe(false)
    expect(root.childElementCount).toBe(0)
  })
})
