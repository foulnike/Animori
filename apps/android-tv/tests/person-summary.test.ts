import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCharacterCard, type CharacterCard } from '@/api/anilist-person'
import PersonSheet from '@/app/components/PersonSheet.vue'
import { askRussianPersonFull, type PersonAnswer } from '@/core/person-title'
import { settings } from '@/core/settings'
import { installMockBridge, resetMockBridge } from '@core-tests/bridge-module'

vi.mock('@/api/anilist-person', () => ({
  fetchCharacterCard: vi.fn(),
  fetchStaffCard: vi.fn(),
}))
vi.mock('@/core/person-title', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/person-title')>()),
  askRussianPersonFull: vi.fn(),
}))

const card: CharacterCard = {
  id: 61,
  name: { full: 'Robin Nico', native: null, alternative: null },
  image: null,
  description: [
    '__Position:__ Archaeologist',
    '__Devil Fruit:__ ~!Скрытое значение!~',
    '__Custom detail:__ ' + 'Длинное значение с несколькими словами. '.repeat(5),
    '',
    'Основное описание AniList.',
  ].join('\n'),
  gender: 'Female',
  age: '28-',
  bloodType: 'S',
  height: { initial: { metric: 188, imperial: null }, min: null, max: null },
  dateOfBirth: { year: null, month: 2, day: 6 },
  siteUrl: 'https://anilist.co/character/61',
  media: null,
}

const translateCharacters = settings.translateCharacters
let app: App | undefined

function mount(): void {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h(PersonSheet, {
        start: {
          personId: card.id,
          kind: 'character',
          name: card.name.full,
          native: null,
          image: null,
          siteUrl: card.siteUrl,
        },
      }),
  })
  app.directive('tip', () => undefined)
  app.mount(host)
}

function button(scope: ParentNode, selector: string): HTMLButtonElement {
  const found = scope.querySelector<HTMLButtonElement>(selector)
  if (!found) throw new Error('Кнопка отсутствует: ' + selector)
  return found
}

beforeEach(() => {
  installMockBridge()
  settings.translateCharacters = true
  vi.mocked(fetchCharacterCard).mockResolvedValue({ state: 'ready', card })
})

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  settings.translateCharacters = translateCharacters
  resetMockBridge()
})

describe('сведения в карточке персонажа', () => {
  it('показывает факты до перевода, раскрывает спойлер отдельно и сохраняет русскую биографию', async () => {
    let resolveTranslation: (answer: PersonAnswer) => void = () => undefined
    vi.mocked(askRussianPersonFull).mockReturnValue(
      new Promise((resolve) => {
        resolveTranslation = resolve
      }),
    )
    mount()

    const panel = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>('.am-person-summary')
      expect(element).not.toBeNull()
      return element!
    })
    expect(panel.textContent).toContain('188 см')
    expect(panel.textContent).not.toContain('Длинное значение')
    expect(document.querySelector('.am-ps-desc')).toBeNull()

    const expand = button(panel, '.am-person-summary__toggle')
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    expand.click()
    await nextTick()
    expect(expand.getAttribute('aria-expanded')).toBe('true')
    expect(panel.textContent).toContain('Archaeologist')
    expect(panel.textContent).toContain('Длинное значение')
    expect(panel.textContent).not.toContain('Скрытое значение')

    const spoiler = button(panel, '.am-rich__reveal')
    spoiler.click()
    await nextTick()
    expect(spoiler.getAttribute('aria-expanded')).toBe('true')
    expect(panel.textContent).toContain('Скрытое значение')

    resolveTranslation({
      state: 'ready',
      person: {
        russian: 'Робин Нико',
        description:
          'Русская биография. [url=https://x.com/author]Соцсеть[/url] и [character=42]Герой[/character].',
      },
    })
    await vi.waitFor(() => {
      expect(document.querySelector('.am-ps-desc')?.textContent).toBe(
        'Русская биография. Соцсеть и Герой.',
      )
      expect(document.querySelector('.am-ps-desc a, .am-ps-src a')).toBeNull()
    })
    expand.click()
    await nextTick()
    expect(panel.textContent).not.toContain('Скрытое значение')
    expect(panel.textContent).not.toContain('Длинное значение')
  })

  it.each<PersonAnswer>([
    { state: 'none', person: null },
    {
      state: 'ready',
      person: {
        russian: 'Робин Нико',
        shikiId: 61,
        description: '<div class="b-text_with_paragraphs"></div>',
      },
    },
  ])('оставляет оригинальную биографию при пустом переводе ($state)', async (answer) => {
    vi.mocked(askRussianPersonFull).mockResolvedValue(answer)
    mount()

    await vi.waitFor(() => {
      expect(document.querySelector('.am-ps-desc')?.textContent).toBe('Основное описание AniList.')
      expect(document.querySelector('.am-person-summary')?.textContent).toContain('Группа крови')
      expect(document.querySelector('.am-ps-src')).toBeNull()
    })
  })
})
