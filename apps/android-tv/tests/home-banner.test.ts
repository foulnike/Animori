import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MediaBrief, MediaCard } from '@/api/anilist-media'
import AppShell from '@/app/components/AppShell.vue'
import { startDpad } from '@/app/dpad'
import HomeScreen from '@/app/screens/HomeScreen.vue'
import { peekBanner, warmBanner } from '@/core/banner-cache'
import { shelfFill } from '@/core/recs'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

vi.mock('@/core/banner-cache', () => ({ peekBanner: vi.fn(), warmBanner: vi.fn() }))
vi.mock('@/core/recs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/recs')>()),
  shelfFill: vi.fn(),
}))

function brief(mediaId: number): MediaBrief {
  return {
    mediaId,
    malId: null,
    type: 'ANIME',
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    chapters: null,
    duration: 24,
    seasonYear: 2025,
    averageScore: 80,
    isAdult: false,
    tags: null,
    romaji: `Тайтл ${mediaId}`,
    english: null,
    native: null,
    cover: null,
    color: null,
    airingEpisode: null,
    airingAt: null,
    ownEntry: null,
  }
}

function mountHome(ready: number[]): App {
  vi.mocked(shelfFill).mockImplementation(async (name) =>
    name === 'top' ? [1, 2, 3, 4].map(brief) : [],
  )
  vi.mocked(peekBanner).mockImplementation((id) => {
    if (!ready.includes(id)) return null
    const card: MediaCard = {
      ...brief(id),
      volumes: null,
      genres: [],
      siteUrl: null,
      description: null,
      banner: null,
      trailer: null,
      studios: [],
    }
    return { card, title: null, image: `/banner-${id}.jpg` }
  })
  vi.mocked(warmBanner).mockImplementation(() => new Promise(() => undefined))
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(AppShell, null, { default: () => h(HomeScreen) }) })
  app.directive('tip', () => undefined)
  app.directive('seen', () => undefined)
  app.mount(host)
  return app
}

function button(selector: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(selector)
  if (!element) throw new Error(`Кнопка ${selector} отсутствует`)
  return element
}

function place(element: HTMLElement, x: number, y: number, width: number, height: number): void {
  element.getBoundingClientRect = () => new DOMRect(x, y, width, height)
}

function press(key: string): void {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  )
}

function slideTitle(): string | null | undefined {
  return document.querySelector('#am-home-hero-title')?.textContent
}

let app: App | undefined
let stopDpad: (() => void) | undefined

beforeEach(() => {
  installMockBridge()
  window.history.replaceState(null, '', '#/home')
})

afterEach(() => {
  stopDpad?.()
  stopDpad = undefined
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
  resetMockBridge()
})

describe('верхний баннер Android TV', () => {
  it('даёт выбрать стрелки пультом и циклически листает готовые слайды', async () => {
    app = mountHome([1, 3, 4])
    stopDpad = startDpad()
    await vi.waitFor(() => expect(slideTitle()).toBe('Тайтл 1'))

    const banner = button('.am-home-hero__open')
    const previous = button('button[aria-label="Предыдущий слайд"]')
    const next = button('button[aria-label="Следующий слайд"]')
    const menu = button('.am-side__item--on')
    place(banner, 100, 200, 800, 330)
    place(previous, 720, 220, 40, 40)
    place(next, 820, 220, 40, 40)
    place(menu, 10, 220, 40, 40)
    banner.focus()

    press('ArrowLeft')
    expect(document.activeElement).toBe(menu)
    press('ArrowRight')
    expect(document.activeElement).toBe(banner)
    press('ArrowRight')
    expect(document.activeElement).toBe(previous)
    press('ArrowRight')
    expect(document.activeElement).toBe(next)

    next.click()
    await nextTick()
    expect(slideTitle()).toBe('Тайтл 3')
    expect(document.activeElement).toBe(next)
    const dots = document.querySelectorAll('.am-home-hero__dots span')
    expect(dots).toHaveLength(3)
    expect(dots[1]?.classList.contains('am-home-hero__dot--on')).toBe(true)

    previous.click()
    await nextTick()
    expect(slideTitle()).toBe('Тайтл 1')
    previous.click()
    await nextTick()
    expect(slideTitle()).toBe('Тайтл 4')
    expect(window.location.hash).toBe('#/home')
    banner.click()
    expect(window.location.hash).toBe('#/media/4')
  })

  it('показывает баннер без кнопок листания, пока готов только один слайд', async () => {
    app = mountHome([1])
    await vi.waitFor(() => expect(slideTitle()).toBe('Тайтл 1'))
    expect(document.querySelector('.am-home-hero__navigation')).toBeNull()
  })

  it('заново отсчитывает 15 секунд после ручного переключения', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    app = mountHome([1, 3, 4])
    await vi.waitFor(() => expect(slideTitle()).toBe('Тайтл 1'))
    await vi.advanceTimersByTimeAsync(10_000)
    button('button[aria-label="Следующий слайд"]').click()
    await nextTick()

    await vi.advanceTimersByTimeAsync(14_999)
    expect(slideTitle()).toBe('Тайтл 3')
    await vi.advanceTimersByTimeAsync(1)
    expect(slideTitle()).toBe('Тайтл 4')
  })
})
