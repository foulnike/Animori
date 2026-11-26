import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installMockBridge, type MockBridgeHandle } from '@core-tests/bridge-module'
import { assets } from '@/app/onboarding'
import { DOCUMENTS } from '../../../packages/onboarding/src/content'
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

  it('открывает галереи, требует согласие и закрывается после сохранения', async () => {
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
      'AniMori запомнит, где вы остановились.',
    )
    expect(root.querySelector('.am-intro__details')).toBeNull()
    expect(root.querySelector('figure img')?.getAttribute('src')).toBe(
      assets.galleries.player[0].src,
    )
    expect(root.querySelector('.am-intro__gallery-nav')).toBeNull()

    next.click()
    await nextTick()
    expect(heading()).toBe('Ведите свой список')

    const firstShot = root.querySelector('figure img')?.getAttribute('src')
    root.querySelector<HTMLButtonElement>('[aria-label="Следующий скриншот"]')!.click()
    await nextTick()
    expect(root.querySelector('figure img')?.getAttribute('src')).not.toBe(firstShot)

    for (const single of [assets.galleries.transfer[0], assets.galleries.cloud[0]]) {
      next.click()
      await nextTick()
      expect(root.querySelector('figure img')?.getAttribute('src')).toBe(single.src)
      expect(root.querySelector('.am-intro__gallery-nav')).toBeNull()
    }
    next.click()
    await nextTick()
    next.click()
    await nextTick()
    expect(heading()).toBe('Условия использования')
    expect(next.disabled).toBe(true)
    expect(await needsOnboarding()).toBe(true)

    root.querySelector<HTMLAnchorElement>('.am-intro__documents a')!.click()
    expect(mock.bridge.shell.openExternal).toHaveBeenCalledWith(DOCUMENTS[0]?.url)
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
