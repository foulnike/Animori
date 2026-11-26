import { createApp, h, nextTick, ref } from 'vue'
import { expect, it, vi } from 'vitest'

import type { PersonTarget } from '@/api/anilist-person'
import AboutBox from '@/app/components/AboutBox.vue'
import { closePerson, shownPerson } from '@/app/person-layer'
import { mediaLinks } from '@/core/media-links'
import { resolveShikiPerson } from '@/core/person-link'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

vi.mock('@/core/person-link', () => ({ resolveShikiPerson: vi.fn() }))

it('открывает персонажа из спойлера и запрашивает подтверждение для соцсетей и источников', async () => {
  const { bridge } = installMockBridge()
  const openExternal = vi.mocked(bridge.shell.openExternal).mockResolvedValue(undefined)
  const person: PersonTarget = {
    kind: 'character',
    personId: 123,
    name: 'Герой',
    native: null,
    image: null,
    siteUrl: 'https://anilist.co/character/123',
  }
  vi.mocked(resolveShikiPerson).mockResolvedValue(person)
  const open = ref(false)
  const close = vi.fn(() => (open.value = false))
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    render: () =>
      h(AboutBox, {
        open: open.value,
        onClose: close,
        text: '[spoiler][character=42]Герой[/character] и [url=https://x.com/author]Соцсеть[/url][/spoiler]',
        links: mediaLinks({ mediaId: 1, malId: 2 }),
      }),
  })
  app.directive('tip', () => undefined)

  app.mount(host)
  try {
    open.value = true
    await nextTick()
    const dialog = document.querySelector<HTMLElement>('.am-modal')!
    expect(dialog.querySelector('.am-rich a')).toBeNull()
    dialog.querySelector<HTMLButtonElement>('.am-rich__reveal')!.click()
    await nextTick()

    const links = Array.from(dialog.querySelectorAll<HTMLAnchorElement>('.am-rich a'))
    expect(links.map((link) => link.textContent)).toEqual(['Герой', 'Соцсеть'])
    links[1]!.click()
    expect(openExternal).toHaveBeenNthCalledWith(1, 'https://x.com/author', { confirm: true })

    const sources = Array.from(dialog.querySelectorAll<HTMLAnchorElement>('nav a'))
    expect(sources.map((link) => link.textContent?.trim())).toEqual([
      'AniList #1',
      'MAL #2',
      'Шикимори',
    ])
    sources[1]!.click()
    expect(openExternal).toHaveBeenNthCalledWith(2, 'https://myanimelist.net/anime/2', {
      confirm: true,
    })
    expect(close).not.toHaveBeenCalled()

    links[0]!.click()
    await vi.waitFor(() => {
      expect(resolveShikiPerson).toHaveBeenCalledWith('character', 42)
      expect(shownPerson.value).toEqual(person)
      expect(close).toHaveBeenCalledOnce()
    })
    expect(openExternal).toHaveBeenCalledTimes(2)
  } finally {
    app.unmount()
    host.remove()
    closePerson()
    resetMockBridge()
  }
})
