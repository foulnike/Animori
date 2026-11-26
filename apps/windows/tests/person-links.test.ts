// Хвост карточки человека: адреса собираются из номеров, и решение «показывать ли ссылку на
// Шикимори» целиком здесь. Проверяются три случая: адрес есть, адреса нет, описание не с Шикимори.

import { describe, expect, it } from 'vitest'

import { personLinks } from '@/core/person-links'

describe('personLinks', () => {
  it('указывает AniList, когда пришла своя страница', () => {
    const links = personLinks({
      kind: 'character',
      siteUrl: 'https://anilist.co/character/1',
      shikiId: null,
      fromShiki: false,
    })

    expect(links).toHaveLength(1)
    expect(links[0]?.key).toBe('anilist')
    expect(links[0]?.url).toBe('https://anilist.co/character/1')
  })

  it('молчит без адреса: пустой хвост читался бы как поломка', () => {
    expect(personLinks({ kind: 'staff', siteUrl: null, shikiId: 42, fromShiki: false })).toEqual([])
  })

  it('пустая строка адреса равна его отсутствию', () => {
    expect(personLinks({ kind: 'staff', siteUrl: '   ', shikiId: 42, fromShiki: false })).toEqual(
      [],
    )
  })

  it('добавляет Шикимори, когда описание пришло оттуда', () => {
    const links = personLinks({
      kind: 'character',
      siteUrl: 'https://anilist.co/character/1',
      shikiId: 293411,
      fromShiki: true,
    })

    expect(links.map((l) => l.key)).toEqual(['anilist', 'shiki'])
    // Персонажи и авторы лежат в разных разделах: перепутать — увести в никуда.
    expect(links[1]?.url).toMatch(/\/characters\/293411$/)
  })

  it('автору адрес в разделе people', () => {
    const links = personLinks({
      kind: 'staff',
      siteUrl: null,
      shikiId: 9,
      fromShiki: true,
    })

    expect(links[0]?.url).toMatch(/\/people\/9$/)
  })

  it('без описания с Шикимори ссылки на него нет: страницы может не быть', () => {
    const links = personLinks({
      kind: 'character',
      siteUrl: 'https://anilist.co/character/1',
      shikiId: 293411,
      fromShiki: false,
    })

    expect(links.map((l) => l.key)).toEqual(['anilist'])
  })

  it('без номера ссылки нет даже с описанием', () => {
    expect(personLinks({ kind: 'staff', siteUrl: null, shikiId: null, fromShiki: true })).toEqual(
      [],
    )
    expect(personLinks({ kind: 'staff', siteUrl: null, shikiId: 0, fromShiki: true })).toEqual([])
  })
})
