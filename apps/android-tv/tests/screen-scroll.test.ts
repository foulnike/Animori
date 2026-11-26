import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AppShell from '@/app/components/AppShell.vue'
import { navigate } from '@/app/router'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

let app: App
let top: number
let maxTop: number

function scrollTo(y: number): void {
  top = Math.min(y, maxTop)
  window.dispatchEvent(new Event('scroll'))
}

async function show(mediaId?: number): Promise<void> {
  if (mediaId === undefined) navigate('home', {}, { replace: true })
  else navigate('media', { id: String(mediaId) }, { replace: true })
  await nextTick()
}

beforeEach(async () => {
  installMockBridge()
  top = 0
  maxTop = Infinity
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => top)
  vi.spyOn(window, 'scrollTo').mockImplementation(
    (options?: ScrollToOptions | number, y?: number) => {
      top = Math.min((typeof options === 'number' ? y : options?.top) ?? top, maxTop)
    },
  )
  await show()

  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(AppShell) })
  app.directive('tip', () => undefined)
  app.mount(host)
})

afterEach(() => {
  app.unmount()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetMockBridge()
})

describe('прокрутка при смене экрана', () => {
  it('помнит позицию главной, а карточки всегда открывает сверху', async () => {
    scrollTo(210)
    await show(1)
    expect(top).toBe(0)
    scrollTo(550)

    await show()
    expect(top).toBe(210)
    await show(2)
    expect(top).toBe(0)
    scrollTo(330)

    await show(1)
    expect(top).toBe(0)
    await show(2)
    expect(top).toBe(0)
  })

  it('отменяет отложенную прокрутку главной при повторном открытии карточки', async () => {
    vi.useFakeTimers()
    scrollTo(550)
    await show(1)
    scrollTo(330)

    maxTop = 100
    await show()
    expect(top).toBe(100)

    await show(1)
    expect(top).toBe(0)
    maxTop = Infinity
    await vi.advanceTimersByTimeAsync(200)
    expect(top).toBe(0)
    expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: 'instant' })
  })
})
