// Смоук доступности: axe идёт по настоящей разметке — главный экран в рамке AppShell и
// модалка записи, обе собраны из боевых SFC. color-contrast выключен осознанно: happy-dom
// не считает пиксели, а контраст токенов тем считает отдельный набор tests/theme-contrast.test.ts.
// Контекст — body: <html> тестовой среды несёт дефолтный документ, а не index.html приложения.

import { createApp, h, nextTick, type App, type VNode } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AxeMatchers } from 'vitest-axe'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/dist/matchers'

import AppShell from '@/app/components/AppShell.vue'
import EntrySheet from '@/app/components/EntrySheet.vue'
import HomeScreen from '@/app/screens/HomeScreen.vue'
import { seen } from '@/app/see-tile'
import { tip } from '@/app/tip'

import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

expect.extend({ toHaveNoViolations })

// У vitest-axe есть только глобальная типизация под старый Vi — под vitest 4 её дописываем здесь же.
declare module '@vitest/expect' {
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } } as const

let mounted: App[] = []

function mount(render: () => VNode): void {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render })
  // Директивы вешаются в main.ts приложения; тест поднимает экраны минуя его.
  app.directive('tip', tip)
  app.directive('seen', seen)
  app.mount(host)
  mounted.push(app)
}

/** Первый тик разводит хуки, пауза даёт осесть запросам в заглушку моста. */
async function settle(): Promise<void> {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 150))
  await nextTick()
}

async function audit(): Promise<void> {
  const results = await axe(document.body, AXE_OPTIONS)
  expect(results).toHaveNoViolations()
}

beforeEach(() => {
  resetMockBridge()
  installMockBridge()
})

afterEach(() => {
  for (const app of mounted) app.unmount()
  mounted = []
  document.body.innerHTML = ''
  resetMockBridge()
})

describe('главный экран', () => {
  it('в рамке AppShell проходит axe без нарушений', async () => {
    mount(() => h(AppShell, null, { default: () => h(HomeScreen) }))
    await settle()
    await audit()
  })
})

describe('модалка записи', () => {
  it('проходит axe без нарушений', async () => {
    mount(() =>
      h(EntrySheet, {
        title: 'Тестовый тайтл',
        status: 'CURRENT',
        score10: 7,
        progress: 3,
        partsTotal: 12,
        repeat: 0,
        startedAt: null,
        completedAt: null,
        notes: null,
        onClose: () => undefined,
      }),
    )
    await settle()
    await audit()
  })
})
