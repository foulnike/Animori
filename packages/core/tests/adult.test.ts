// Проверки отбора взрослого: возраст по дате рождения и условие «прятать». Две вещи здесь стоят
// проверок отдельно от экранов.

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ADULT_AGE,
  adultAllowed,
  adultByBirth,
  ageAt,
  hiddenCount,
  keepAllowed,
  regulatedByTags,
} from '@/core/adult'
import { matchesEntry } from '@/core/collection-view'
import { settings } from '@/core/settings'
import type { SnapshotEntry } from '@/core/snapshot'

/** Запись снимка: для отбора важно только поле «взрослый». */
function entry(mediaId: number, isAdult: boolean): SnapshotEntry {
  return {
    mediaId,
    status: 'watching',
    score10: 0,
    progress: 0,
    repeat: 0,
    startedAt: null,
    completedAt: null,
    notes: null,
    updatedAt: 0,
    isAdult,
    // Названия латиницей в отборе не участвуют, но поле обязательное: запись снимка
    // обязана быть такой же формой, как настоящая, иначе проверка отсекает не то.
    romaji: null,
    english: null,
  }
}

/** Тэг с именем и весом — для тестовых наборов. */
function tag(name: string, rank: number) {
  return { name, rank }
}

beforeEach(() => {
  // Тумблер читается в момент вопроса, поэтому его достаточно выставить
  // в самом объекте настроек: отдельного пути для проверок у него нет.
  settings.showAdult = false
  settings.adultMode = 'full'
  settings.adultTagRules = Object.fromEntries(
    Object.entries(settings.adultTagRules).map(([name, rule]) => [name, { ...rule, hideInPartial: false }]),
  )
})

describe('ageAt', () => {
  it('считает полные годы, а не разницу годов', () => {
    // День рождения сегодня: восемнадцать уже есть.
    expect(ageAt('2008-09-18', new Date(2026, 8, 18))).toBe(18)
  })

  it('не засчитывает год, если день рождения ещё впереди', () => {
    // Разница годов здесь ровно восемнадцать, а полных лет — семнадцать.
    expect(ageAt('2008-09-19', new Date(2026, 8, 18))).toBe(17)
  })

  it('засчитывает год, если день рождения был вчера', () => {
    expect(ageAt('2008-09-17', new Date(2026, 8, 18))).toBe(18)
  })

  it('разбирается с 29 февраля', () => {
    // В невисокосном году дня рождения ещё не было, а в марте он уже прошёл.
    expect(ageAt('2008-02-29', new Date(2026, 1, 28))).toBe(17)
    expect(ageAt('2008-02-29', new Date(2026, 2, 1))).toBe(18)
  })

  it('отвечает null на негодную дату', () => {
    expect(ageAt('', new Date(2026, 8, 18))).toBeNull()
    expect(ageAt(null, new Date(2026, 8, 18))).toBeNull()
    expect(ageAt(undefined, new Date(2026, 8, 18))).toBeNull()
    expect(ageAt('18.09.2008', new Date(2026, 8, 18))).toBeNull()
    expect(ageAt('2008-13-01', new Date(2026, 8, 18))).toBeNull()
    expect(ageAt('2008-09-32', new Date(2026, 8, 18))).toBeNull()
  })

  it('отвечает null на дату из будущего', () => {
    expect(ageAt('2030-01-01', new Date(2026, 8, 18))).toBeNull()
  })
})

describe('adultByBirth', () => {
  it('пускает ровно в восемнадцать', () => {
    expect(adultByBirth('2008-09-18', new Date(2026, 8, 18))).toBe(true)
  })

  it('не пускает за день до восемнадцати', () => {
    expect(adultByBirth('2008-09-19', new Date(2026, 8, 18))).toBe(false)
  })

  it('на негодной дате отвечает «нет», а не «да»', () => {
    // Ошибка здесь пускала бы вперёд, а не назад, — и это не тот случай,
    // где можно ошибиться в чужую пользу.
    expect(adultByBirth('', new Date(2026, 8, 18))).toBe(false)
    expect(adultByBirth(null, new Date(2026, 8, 18))).toBe(false)
    expect(adultByBirth('не дата', new Date(2026, 8, 18))).toBe(false)
  })

  it('возраст показа — восемнадцать', () => {
    expect(ADULT_AGE).toBe(18)
  })
})

describe('regulatedByTags', () => {
  it('блокирует жёсткий тэг при весе ≥ 40%', () => {
    // Oreimo: Incest 85% — явно выше порога
    expect(regulatedByTags([tag('Incest', 85)])).toBe(true)
    // Граница: ровно 40%
    expect(regulatedByTags([tag('Incest', 40)])).toBe(true)
  })

  it('пропускает жёсткий тэг ниже порога', () => {
    expect(regulatedByTags([tag('Incest', 39)])).toBe(false)
    expect(regulatedByTags([tag('Incest', 0)])).toBe(false)
  })

  it('блокирует мягкий тэг при весе ≥ 70%', () => {
    expect(regulatedByTags([tag("Boys' Love", 70)])).toBe(true)
    expect(regulatedByTags([tag('LGBTQ+ Themes', 85)])).toBe(true)
  })

  it('пропускает мягкий тэг ниже порога', () => {
    // Cardcaptor Sakura: LGBTQ+=61%, Boys' Love=50% — не должны блокировать
    expect(regulatedByTags([tag('LGBTQ+ Themes', 61)])).toBe(false)
    expect(regulatedByTags([tag("Boys' Love", 50)])).toBe(false)
  })

  it('блокирует при наличии хотя бы одного превышающего порог тэга', () => {
    expect(regulatedByTags([tag('Yuri', 48), tag('Incest', 42)])).toBe(true)
  })

  it('пропускает пустой и null список', () => {
    expect(regulatedByTags([])).toBe(false)
    expect(regulatedByTags(null)).toBe(false)
    expect(regulatedByTags(undefined)).toBe(false)
  })

  it('не затрагивает тайтл с isAdult=true: там уже красная плашка', () => {
    // Interspecies Reviewers: isAdult=true, Bisexual=57% — не мешает нашему фильтру,
    // но adultAllowed обработает его раньше
    expect(regulatedByTags([tag('Bisexual', 57)])).toBe(false)
  })
})

describe('adultAllowed', () => {
  it('при включённом тумблере пускает всё', () => {
    settings.showAdult = true
    expect(adultAllowed(true)).toBe(true)
    expect(adultAllowed(false, [tag('Incest', 90)])).toBe(true)
  })

  it('при выключенном блокирует isAdult=true', () => {
    expect(adultAllowed(true)).toBe(false)
  })

  it('при выключенном блокирует регулируемое по тэгам', () => {
    expect(adultAllowed(false, [tag('Incest', 50)])).toBe(false)
    expect(adultAllowed(false, [tag("Boys' Love", 75)])).toBe(false)
  })

  it('при выключенном пропускает обычный тайтл без тэгов', () => {
    expect(adultAllowed(false)).toBe(true)
    expect(adultAllowed(false, null)).toBe(true)
    expect(adultAllowed(false, [])).toBe(true)
  })

  it('при выключенном пропускает тайтл с мягким тэгом ниже порога', () => {
    // K-ON!: Yuri=48% — не блокируется
    expect(adultAllowed(false, [tag('Yuri', 48)])).toBe(true)
  })

  it('в частичном режиме прячет красное, но показывает синее по умолчанию', () => {
    settings.adultMode = 'partial'
    expect(adultAllowed(true)).toBe(false)
    expect(adultAllowed(false, [tag('LGBTQ+ Themes', 90)])).toBe(true)
  })

  it('в частичном режиме умеет дополнительно прятать синее', () => {
    settings.adultMode = 'partial'
    settings.adultTagRules["Boys' Love"].hideInPartial = true
    settings.adultTagRules['LGBTQ+ Themes'].hideInPartial = true
    expect(adultAllowed(false, [tag('LGBTQ+ Themes', 90)])).toBe(false)
  })

  it('берёт изменённые пороги регулируемых тегов', () => {
    settings.adultTagRules.Incest.threshold = 80
    settings.adultTagRules.Yuri.threshold = 90
    expect(regulatedByTags([tag('Incest', 79)])).toBe(false)
    expect(regulatedByTags([tag('Incest', 80)])).toBe(true)
    expect(regulatedByTags([tag('Yuri', 89)])).toBe(false)
    expect(regulatedByTags([tag('Yuri', 90)])).toBe(true)
  })
})

describe('keepAllowed и hiddenCount', () => {
  const items = [entry(1, false), entry(2, true), entry(3, true)]

  it('при включённом тумблере отдаёт всё и ничего не считает скрытым', () => {
    settings.showAdult = true

    expect(keepAllowed(items, (item) => item.isAdult)).toHaveLength(3)
    expect(hiddenCount(items, (item) => item.isAdult)).toBe(0)
  })

  it('при выключенном прячет взрослое и говорит, сколько спрятал', () => {
    expect(keepAllowed(items, (item) => item.isAdult).map((item) => item.mediaId)).toEqual([1])
    expect(hiddenCount(items, (item) => item.isAdult)).toBe(2)
  })

  it('прячет регулируемые тайтлы при наличии tagsOf', () => {
    type T = { id: number; adult: boolean; tags: Array<{ name: string; rank: number }> | null }
    const rows: T[] = [
      { id: 1, adult: false, tags: null },
      { id: 2, adult: false, tags: [tag('Incest', 85)] },
      { id: 3, adult: false, tags: [tag('Yuri', 50)] }, // ниже порога
      { id: 4, adult: true, tags: null },
    ]

    const kept = keepAllowed(rows, (r) => r.adult, (r) => r.tags)
    expect(kept.map((r) => r.id)).toEqual([1, 3])
    expect(hiddenCount(rows, (r) => r.adult, (r) => r.tags)).toBe(2)
  })
})

describe('условие hideAdult в отборе коллекции', () => {
  it('при выключенном тумблере прячет взрослую запись', () => {
    expect(matchesEntry(entry(2, true), { hideAdult: true })).toBe(false)
    expect(matchesEntry(entry(1, false), { hideAdult: true })).toBe(true)
  })

  it('при включённом тумблере не прячет ничего', () => {
    settings.showAdult = true

    expect(matchesEntry(entry(2, true), { hideAdult: true })).toBe(true)
  })

  it('без условия взрослая запись проходит: на этом стоят внутренние вопросы', () => {
    // «Есть ли запись у этого тайтла» спрашивается тем же отбором, и прятать
    // там значит соврать о своём же списке.
    expect(matchesEntry(entry(2, true), {})).toBe(true)
    expect(matchesEntry(entry(2, true))).toBe(true)
  })
})


/** Запись снимка: для отбора важно только поле «взрослый». */
