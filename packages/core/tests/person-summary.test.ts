import { describe, expect, it } from 'vitest'

import type { CharacterCard, StaffCard } from '../src/api/anilist-person'
import {
  personCardFacts,
  selectPersonBiography,
  splitPersonDescription,
} from '../src/core/person-summary'
import { parseRich } from '../src/core/rich-text'

const profile = {
  id: 61,
  name: { full: 'Robin Nico', native: null, alternative: null },
  image: null,
  description: null,
  dateOfBirth: { year: null, month: 2, day: 6 },
  gender: 'Female',
  bloodType: 'S',
  height: {
    initial: null,
    min: { metric: 188, imperial: "6'2\"" },
    max: { metric: 188, imperial: "6'2\"" },
  },
  siteUrl: 'https://anilist.co/character/61',
}

const words = {
  gender: (value: string | null) => (value === 'Female' ? 'Женщина' : value),
  language: (value: string | null) => value,
  occupation: (value: string | null) => value,
}

describe('выбор биографии', () => {
  it.each([
    '<div class="b-text_with_paragraphs"></div>',
    '<div><br>&nbsp;&#160;&#xA0;</div>',
    null,
  ])('показывает оригинал, если Шикимори вернул %s', (shiki) => {
    const original = 'Her friend [Mochiko](https://anilist.co/character/405456) inspired her.'

    expect(selectPersonBiography(shiki, original)).toEqual({
      text: original,
      blocks: parseRich(original),
      fromShiki: false,
    })
  })

  it('выбирает заполненную биографию Шикимори и сохраняет ссылки', () => {
    const shiki = '<div><a href="/characters/301555-mebuki-yamashi">Мэбуки</a></div>'

    expect(selectPersonBiography(shiki, 'Original biography.')).toEqual({
      text: shiki,
      blocks: [
        { kind: 'para', parts: [expect.objectContaining({ kind: 'link', text: 'Мэбуки' })] },
      ],
      fromShiki: true,
    })
  })

  it('не создаёт биографию, если у обоих источников только разметка', () => {
    expect(selectPersonBiography('<div></div>', '<br>')).toBeNull()
  })
})

describe('краткие сведения о персонажах и авторах', () => {
  it('сохраняет нестандартные сведения и выделяет маркированные спойлеры до начала биографии', () => {
    const body = 'Биография.\n\n__Title:__ Остаётся в биографии'
    const raw = [
      '__Position:__ Archaeologist',
      '**Custom detail**: Original value',
      '__Devil Fruit:__ ~!Скрытое значение!~',
      '~!__Secret role:__ Скрытая роль\n\n__Secret name:__ Скрытое имя!~',
      '__Bounty:__ ~!Скрытая награда!~',
      '',
      body,
    ].join('\n')

    const result = splitPersonDescription(raw)
    expect(result.facts.map((fact) => fact.label)).toEqual([
      'Должность',
      'Custom detail',
      'Дьявольский плод',
      null,
      'Награда за поимку',
    ])
    expect(result.facts[1]?.text).toBe('Original value')
    expect(parseRich(result.facts[2]?.text).map((block) => block.kind)).toEqual(['spoiler'])
    expect(parseRich(result.facts[3]?.text).map((block) => block.kind)).toEqual(['spoiler'])
    expect(result.description).toBe(body)
  })

  it('распознаёт строки с HTML-переносами и сохраняет обычное начало биографии', () => {
    const body = '__Biography:__\nТекст биографии'
    expect(splitPersonDescription(body)).toEqual({ facts: [], description: body })
    expect(
      splitPersonDescription('<b>Height:</b> 174 cm<br />Position: Actor<br /><br />Biography.'),
    ).toEqual({
      facts: [
        { label: 'Рост', text: '174 cm', rich: true },
        { label: 'Должность', text: 'Actor', rich: true },
      ],
      description: 'Biography.',
    })
  })

  it('показывает начальный возраст, группу крови и обе единицы роста Робин', () => {
    const card: CharacterCard = { ...profile, age: '28-', media: null }
    expect(personCardFacts(card, words)).toEqual([
      { label: 'Дата рождения', text: '6 февраля' },
      { label: 'Возраст в начале', text: '28' },
      { label: 'Пол', text: 'Женщина' },
      { label: 'Группа крови', text: 'S' },
      { label: 'Рост', text: "188 см (6'2\")" },
    ])
  })

  it('сохраняет родной город автора при неизвестном языке и обрабатывает неполные даты', () => {
    const card: StaffCard = {
      ...profile,
      age: null,
      dateOfBirth: { year: 1972, month: null, day: null },
      dateOfDeath: { year: 2021, month: 5, day: null },
      height: null,
      primaryOccupations: ['Voice Actor', 'Singer'],
      languageV2: null,
      homeTown: 'Tokyo',
      yearsActive: [1991, null],
      characters: [],
    }
    expect(personCardFacts(card, words)).toEqual([
      { label: 'Дата рождения', text: '1972' },
      { label: 'Пол', text: 'Женщина' },
      { label: 'Группа крови', text: 'S' },
      { label: 'Род занятий', text: 'Voice Actor, Singer' },
      { label: 'Родной город', text: 'Tokyo' },
      { label: 'Дата смерти', text: 'май 2021' },
      { label: 'Годы работы', text: 'с 1991' },
    ])
  })
})
