import type { CharacterCard, StaffCard } from '../api/anilist-person'
import { parseRich } from './rich-text'

/** Шикимори может прислать пустой HTML-контейнер вместо отсутствующего описания. */
export function parsePersonBiography(raw: string | null | undefined) {
  if (typeof raw !== 'string') return []
  return parseRich(raw.replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, '\u00a0'))
}

export function selectPersonBiography(
  shiki: string | null | undefined,
  anilist: string | null | undefined,
) {
  const translated = parsePersonBiography(shiki)
  if (shiki && translated.length) return { text: shiki, blocks: translated, fromShiki: true }

  const original = parsePersonBiography(anilist)
  if (anilist && original.length) return { text: anilist, blocks: original, fromShiki: false }

  return null
}

export interface PersonFact {
  label: string | null
  text: string
  rich?: true
}

const FACT_LABELS = new Map([
  ['height', 'Рост'],
  ['weight', 'Вес'],
  ['birthday', 'Дата рождения'],
  ['age', 'Возраст'],
  ['initial age', 'Возраст в начале'],
  ['gender', 'Пол'],
  ['blood type', 'Группа крови'],
  ['position', 'Должность'],
  ['occupation', 'Род занятий'],
  ['affiliation', 'Принадлежность'],
  ['first appearance', 'Первое появление'],
  ['devil fruit', 'Дьявольский плод'],
  ['devil fruit type', 'Тип дьявольского плода'],
  ['bounty', 'Награда за поимку'],
])

function labeledFact(line: string): PersonFact | null {
  const marked = /^(?:(__|\*\*)(.+?)\1|<(b|strong)>(.+?)<\/\3>)\s*([:：]?)/i.exec(line)
  if (marked) {
    const heading = marked[2] ?? marked[4] ?? ''
    if (!/[:：]$/.test(heading.trim()) && !marked[5]) return null
    const label = heading.replace(/[:：]\s*$/, '').trim()
    const text = line.slice(marked[0].length).trim()
    if (label && text) {
      return { label: FACT_LABELS.get(label.toLowerCase()) ?? label, text, rich: true }
    }
  } else {
    const plain = /^([^:：\n]+)[:：]\s+([\s\S]+)$/.exec(line)
    const label = FACT_LABELS.get(plain?.[1]?.trim().toLowerCase() ?? '')
    const text = plain?.[2]?.trim()
    if (label && text) return { label, text, rich: true }
  }
  return null
}

/** AniList помимо отдельных полей хранит дополнительные сведения в начале описания. */
export function splitPersonDescription(raw: string | null | undefined): {
  facts: PersonFact[]
  description: string
} {
  const description = raw ?? ''
  const source = description
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .trimStart()
  // Один спойлер может скрывать сразу несколько строк, включая их названия.
  const row = /(?:~![\s\S]*?!~|[^\n])+/y
  const facts: PersonFact[] = []
  let end = 0

  for (let match = row.exec(source); match; match = row.exec(source)) {
    const line = match[0].trim()
    const hidden = /^~!([\s\S]*?)!~$/.exec(line)?.[1]?.trim()
    if (hidden && labeledFact(hidden.split('\n', 1)[0] ?? '')) {
      facts.push({ label: null, text: line, rich: true })
    } else {
      const fact = labeledFact(line)
      if (!fact) break
      facts.push(fact)
    }
    end = row.lastIndex
    row.lastIndex += 1
  }

  return { facts, description: facts.length ? source.slice(end).trimStart() : description }
}

const MONTHS = [
  ['январь', 'января'],
  ['февраль', 'февраля'],
  ['март', 'марта'],
  ['апрель', 'апреля'],
  ['май', 'мая'],
  ['июнь', 'июня'],
  ['июль', 'июля'],
  ['август', 'августа'],
  ['сентябрь', 'сентября'],
  ['октябрь', 'октября'],
  ['ноябрь', 'ноября'],
  ['декабрь', 'декабря'],
]

function formatDate(date: CharacterCard['dateOfBirth']): string {
  if (!date) return ''
  const months = MONTHS[(date.month ?? 0) - 1]
  const year = date.year
  if (!months) return year ? String(year) : ''
  const day = date.day
  return [day, months[day ? 1 : 0], year].filter(Boolean).join(' ')
}

function formatHeight(height: NonNullable<CharacterCard['height']>['initial']): string {
  const metric = height?.metric == null ? '' : height.metric + ' см'
  const imperial = height?.imperial?.trim()
  if (!imperial) return metric
  return metric ? metric + ' (' + imperial + ')' : imperial
}

interface PersonWords {
  gender: (word: string | null) => string | null
  occupation: (word: string | null) => string | null
  language: (word: string | null) => string | null
}

/** Сведения из полей API доступны сразу, независимо от перевода биографии. */
export function personCardFacts(card: CharacterCard | StaffCard, words: PersonWords): PersonFact[] {
  const facts: PersonFact[] = []
  function add(label: string, value: string | number | null | undefined): void {
    const text = value == null ? '' : String(value).trim()
    if (text) facts.push({ label, text })
  }

  add('Дата рождения', formatDate(card.dateOfBirth))
  const initialAge =
    typeof card.age === 'string' ? /^(\d+)\s*[-–]$/.exec(card.age.trim())?.[1] : null
  add(initialAge ? 'Возраст в начале' : 'Возраст', initialAge ?? card.age)
  add('Пол', words.gender(card.gender))
  add('Группа крови', card.bloodType)

  const initial = formatHeight(card.height?.initial ?? null)
  const min = formatHeight(card.height?.min ?? null)
  const max = formatHeight(card.height?.max ?? null)
  const range = min && max && min !== max ? min + ' — ' + max : min || max
  if (initial && range && initial !== range) add('Рост в начале', initial)
  add('Рост', range || initial)

  if ('primaryOccupations' in card) {
    add('Род занятий', card.primaryOccupations?.map(words.occupation).filter(Boolean).join(', '))
    add('Язык', words.language(card.languageV2))
    add('Родной город', card.homeTown)
    add('Дата смерти', formatDate(card.dateOfDeath))
    const [start, end] = card.yearsActive ?? []
    if (start != null) add('Годы работы', end == null ? 'с ' + start : start + ' — ' + end)
    else if (end != null) add('Годы работы', 'до ' + end)
  }
  return facts
}
