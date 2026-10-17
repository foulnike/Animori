// Куда ведут ссылки из описаний. Ссылка на аниме у Шикимори — это номер MyAnimeList, и такой
// переход остаётся внутри приложения. Номера людей свои, их разрешает ядро; у него нет оболочки.

import { fetchBriefsByMal } from '@/api/anilist-lookup'
import { Bridge } from '@/bridge'
import { resolveShikiPerson } from '@/core/person-link'
import type { RichAim } from '@/core/rich-text'
import { Logger } from '@/utils/logger'

import { openPerson } from './person-layer'
import { canOpenOutside } from './platform'
import { navigate } from './router'

/** Чем кончился переход. Окошко человека закрывается только на `media`: на `person` закрывать нельзя —
 *  окошко только что показало нового человека. */
type RichAimResult = 'media' | 'person' | 'outside'

/** Соответствия MAL и AniList этого запуска: описание часто зовёт одно и то же. */
const known = new Map<number, number | null>()

/** Уводит наружу через оболочку: в WebView2 переход в новом окне молча теряется. На телевизоре
 *  браузера нет, и уводить некуда — молчим. */
function openOutside(url: string): void {
  if (!canOpenOutside()) {
    Logger('INFO', `Описание: выход наружу пропущен, браузера нет (${url})`)
    return
  }

  void Bridge.shell.openExternal(url).catch((e) => {
    Logger('WARN', `Описание: внешняя ссылка не открылась (${url})`, e)
  })
}

/** Номер AniList по номеру MAL. Отказ не запоминается: сеть вернётся. */
async function lookup(malId: number): Promise<number | null> {
  try {
    const briefs = await fetchBriefsByMal([malId])
    const found = briefs[0]?.mediaId ?? null

    // Запоминается и отсутствие: тайтла без пары у AniList нет и через минуту.
    known.set(malId, found)
    return found
  } catch (e) {
    Logger('WARN', `Описание: тайтл MAL ${malId} не нашёлся`, e)
    return null
  }
}

/** Идёт по ссылке из описания и говорит, чем всё кончилось. Любой промах ведёт к источнику:
 *  пусть откроется в браузере, чем никак. */
export async function followRichAim(aim: RichAim): Promise<RichAimResult> {
  if (aim.kind === 'web') {
    openOutside(aim.url)
    return 'outside'
  }

  if (aim.kind === 'person') {
    const target = await resolveShikiPerson(aim.who, aim.shikiId)
    if (target === null) {
      openOutside(aim.url)
      return 'outside'
    }

    openPerson(target)
    return 'person'
  }

  const seen = known.get(aim.malId)
  const mediaId = seen === undefined ? await lookup(aim.malId) : seen

  if (mediaId === null) {
    openOutside(aim.url)
    return 'outside'
  }

  navigate('media', { id: String(mediaId) })
  return 'media'
}
