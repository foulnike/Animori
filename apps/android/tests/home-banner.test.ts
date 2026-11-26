import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MediaBrief, MediaCard } from '@/api/anilist-media'
import AppShell from '@/app/components/AppShell.vue'
import HomeScreen from '@/app/screens/HomeScreen.vue'
import { peekBanner, warmBanner } from '@/core/banner-cache'
import { shelfFill } from '@/core/recs'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

vi.mock('@/core/banner-cache', () => ({ peekBanner: vi.fn(), warmBanner: vi.fn() }))
vi.mock('@/core/recs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/recs')>()),
  shelfFill: vi.fn(),
}))

function card(mediaId: number): MediaCard {
  return {
    mediaId,
    malId: null,
    type: 'ANIME',
    format: mediaId === 1 ? 'MOVIE' : 'TV',
    status: 'FINISHED',
    episodes: 12,
    chapters: null,
    duration: mediaId === 1 ? 100 : 24,
    seasonYear: 2025,
    averageScore: 80,
    isAdult: false,
    tags: null,
    romaji: `Тайтл ${mediaId}`,
    english: null,
    native: null,
    cover: mediaId === 4 ? null : `/cover-${mediaId}.jpg`,
    color: null,
    airingEpisode: null,
    airingAt: null,
    ownEntry: null,
    volumes: null,
    genres: ['Action', 'Supernatural', 'Psychological', 'Slice of Life'],
    siteUrl: null,
    description: '<b>Описание</b><br>аниме',
    banner: null,
    trailer: null,
    studios: [],
  }
}

function mountHome(ready: number[]): App {
  const items: MediaBrief[] = [1, 2, 3, 4].map(card)
  vi.mocked(shelfFill).mockImplementation(async (name) => (name === 'top' ? items : []))
  vi.mocked(peekBanner).mockImplementation((id) =>
    ready.includes(id) ? { card: card(id), title: null, image: `/banner-${id}.jpg` } : null,
  )
  vi.mocked(warmBanner).mockImplementation(() => new Promise(() => undefined))
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(AppShell, null, { default: () => h(HomeScreen) }) })
  app.directive('tip', () => undefined)
  app.directive('seen', () => undefined)
  app.mount(host)
  return app
}

function element<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const match = root.querySelector<T>(selector)
  if (!match) throw new Error(`Элемент ${selector} отсутствует`)
  return match
}

function slideTitle(): string | null | undefined {
  return document.querySelector('#am-home-hero-title')?.textContent
}

function swipe(slide: HTMLElement, startX: number, endX: number): void {
  const start = new Touch({ identifier: 0, target: slide, clientX: startX, clientY: 100 })
  const end = new Touch({ identifier: 0, target: slide, clientX: endX, clientY: 100 })
  slide.dispatchEvent(
    new TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }),
  )
  slide.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }))
}

let app: App | undefined

beforeEach(() => {
  installMockBridge()
  window.history.replaceState(null, '', '#/home')
})

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
  resetMockBridge()
})

describe('верхний баннер телефона', () => {
  it('показывает постер и описание, а точки выбирают готовый слайд без перехода в карточку', async () => {
    app = mountHome([1, 3, 4])
    await vi.waitFor(() => expect(slideTitle()).toBe('Тайтл 1'))

    const hero = element('.am-home-hero')
    const slide = element('.am-home-hero__slide', hero)
    const body = element('.am-home-hero__body', slide)
    expect(element('.am-home-hero__poster', hero).getAttribute('src')).toBe('/cover-1.jpg')
    expect(element('.am-home-hero__description', slide).parentElement).toBe(slide)
    expect(element('.am-home-hero__description', slide).textContent).toBe('Описание аниме')
    expect(element('.am-home-hero__genres', slide).parentElement).toBe(slide)
    expect(
      [...slide.querySelectorAll('.am-home-hero__genres li')].map((item) => item.textContent),
    ).toEqual(['Экшен', 'Сверхъестественное', 'Психологическое', 'Повседневность'])
    expect(element('.am-home-hero__facts', body).textContent).toContain('100 мин')
    expect(body.querySelectorAll('.am-home-hero__dots button')).toHaveLength(3)

    const dot = element('button[aria-label="Слайд 3"]', body)
    dot.click()
    await nextTick()
    expect(slideTitle()).toBe('Тайтл 4')
    expect(dot.getAttribute('aria-current')).toBe('true')
    expect(hero.querySelector('.am-home-hero__poster')).toBeNull()
    expect(window.location.hash).toBe('#/home')

    element('.am-home-hero__open', hero).click()
    expect(window.location.hash).toBe('#/media/4')
  })

  it('пропускает загружающиеся слайды при свайпе и заново отсчитывает 15 секунд', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    app = mountHome([1, 3, 4])
    await vi.waitFor(() => expect(slideTitle()).toBe('Тайтл 1'))
    await vi.advanceTimersByTimeAsync(10_000)

    swipe(element('.am-home-hero__slide'), 230, 130)
    element('.am-home-hero__open').dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    )
    await nextTick()
    expect(slideTitle()).toBe('Тайтл 3')
    expect(window.location.hash).toBe('#/home')

    await vi.advanceTimersByTimeAsync(14_999)
    expect(slideTitle()).toBe('Тайтл 3')
    await vi.advanceTimersByTimeAsync(1)
    expect(slideTitle()).toBe('Тайтл 4')
  })
})
