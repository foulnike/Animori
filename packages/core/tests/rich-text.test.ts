import { describe, expect, it } from 'vitest'

import { descriptionPreviewText, parseRich, type RichBlock, type RichPart } from '@/core/rich-text'

type RichLink = Extract<RichPart, { kind: 'link' }>

/** Текст строки одной строкой: проверять разбор по ней короче всего. */
function line(parts: RichPart[]): string {
  return parts.map((part) => part.text).join('')
}

/** Куски первого абзаца или пустой список. */
function firstPara(blocks: RichBlock[]): RichPart[] {
  const found = blocks.find((block) => block.kind === 'para')
  return found?.kind === 'para' ? found.parts : []
}

function links(parts: RichPart[]): RichLink[] {
  return parts.filter((part): part is RichLink => part.kind === 'link')
}

describe('текст описания для баннера', () => {
  it('сохраняет текст, подписи ссылок и границы между абзацами', () => {
    expect(
      descriptionPreviewText(
        '<b>История</b>&nbsp;про [character=42 героя]<br>' +
          '<a href="https://example.com">Подробнее</a> [quote]отрывок[/quote]',
      ),
    ).toBe('История про героя Подробнее отрывок')
  })

  it('декодирует каждый HTML-символ один раз', () => {
    expect(descriptionPreviewText('&quot;А&quot; &amp; &amp;quot;Б&amp;quot; &#39;В&#39;')).toBe(
      "\"А\" & &quot;Б&quot; 'В'",
    )
  })
})

describe('разбор описаний', () => {
  it('оставляет начертания и ссылки BBcode', () => {
    const blocks = parseRich('Начало [b]жирно[/b] и [url=https://example.com/x]ссылка[/url].')
    const parts = firstPara(blocks)

    expect(line(parts)).toBe('Начало жирно и ссылка.')
    expect(parts.find((part) => part.text === 'жирно')?.face.bold).toBe(true)
    expect(links(parts)[0]?.aim).toEqual({ kind: 'web', url: 'https://example.com/x' })
  })

  it('перекрёстная ссылка на тайтл ведёт внутрь по номеру MAL', () => {
    const blocks = parseRich('Смотри [anime=5114-fullmetal]Стальной алхимик[/anime]')
    const link = links(firstPara(blocks))[0]

    expect(link?.text).toBe('Стальной алхимик')
    expect(link?.aim).toMatchObject({ kind: 'media', malId: 5114 })
  })

  it('сохраняет подпись самозакрывающейся ссылки Shikimori', () => {
    const blocks = parseRich('Давняя подруга [character=299240 ди] и одна из выживших')
    const link = links(firstPara(blocks))[0]

    expect(link?.text).toBe('ди')
    expect(link?.aim).toMatchObject({ kind: 'person', who: 'character', shikiId: 299240 })
  })

  it('спойлер становится своим блоком с заголовком', () => {
    const blocks = parseRich('До [spoiler=Финал]он умирает[/spoiler] после')
    const spoiler = blocks[1]

    expect(blocks.map((block) => block.kind)).toEqual(['para', 'spoiler', 'para'])
    expect(spoiler?.kind === 'spoiler' ? spoiler.label : '').toBe('Финал')
    expect(spoiler?.kind === 'spoiler' ? line(firstPara(spoiler.blocks)) : '').toBe('он умирает')
  })

  it('разметка AniList приводится к той же форме', () => {
    const blocks = parseRich('Строка<br>__важно__ и ~!секрет!~ и [подпись](https://a.b/c)')
    const tail = blocks[2]

    expect(blocks.map((block) => block.kind)).toEqual(['para', 'spoiler', 'para'])
    expect(line(firstPara(blocks))).toBe('Строка\nважно и')
    expect(tail?.kind === 'para' ? line(tail.parts) : '').toBe('и подпись')
  })

  it('не показывает служебную HTTP-ссылку WebView как markdown', () => {
    const blocks = parseRich('Давняя подруга [персонаж](http://tauri.localhost/#) и одна из выживших')
    const parts = firstPara(blocks)

    expect(line(parts)).toBe('Давняя подруга персонаж и одна из выживших')
    expect(links(parts)).toHaveLength(0)
  })

  it('оставляет ссылки на соцсети и вики внешними, в том числе по HTTP', () => {
    const blocks = parseRich(
      '<a href="//x.com/author">Соцсеть</a> и [Вики](http://wiki.example/animes/73)',
    )
    expect(links(firstPara(blocks)).map((link) => link.aim)).toEqual([
      { kind: 'web', url: 'https://x.com/author' },
      { kind: 'web', url: 'http://wiki.example/animes/73' },
    ])
  })

  it('не делает ссылки с учётными данными и непубличными схемами кликабельными', () => {
    const blocks = parseRich(
      '[url=https://x.com@elsewhere.example/]Ложный адрес[/url] и <a href="file:///test">Файл</a>',
    )
    const parts = firstPara(blocks)
    expect(line(parts)).toBe('Ложный адрес и Файл')
    expect(links(parts)).toHaveLength(0)
  })

  it('восстанавливает ссылки персонажей из HTML-описания Shikimori', () => {
    const blocks = parseRich(
      '<div>Вот <a href="/characters/10421-mai-minakami">Май Минаками</a> и <a href="https://shikimori.io/characters/41055-hakase-shinonome">Профессор</a>.</div>',
    )
    const found = links(firstPara(blocks))

    expect(found.map((link) => link.text)).toEqual(['Май Минаками', 'Профессор'])
    expect(found[0]?.aim).toMatchObject({ kind: 'person', who: 'character', shikiId: 10421 })
    expect(found[1]?.aim).toMatchObject({ kind: 'person', who: 'character', shikiId: 41055 })
  })

  it('сохраняет HTML-спойлер Shikimori вместе со ссылками внутри', () => {
    const blocks = parseRich(
      '<div class="b-text_with_paragraphs">До<br><div class="b-spoiler_block is-opened"><span>спойлер</span><div>Скрытый текст, <a href="/characters/305248-avida-yang">Авида Ян</a>.</div></div></div>',
    )
    const spoiler = blocks.find((block) => block.kind === 'spoiler')
    const inner = spoiler?.kind === 'spoiler' ? firstPara(spoiler.blocks) : []

    expect(spoiler?.kind === 'spoiler' ? spoiler.label : '').toBe('спойлер')
    expect(line(inner)).toBe('Скрытый текст, Авида Ян.')
    expect(links(inner)[0]?.aim).toMatchObject({ kind: 'person', who: 'character', shikiId: 305248 })
  })

  it('список собирается пунктами', () => {
    const blocks = parseRich('[list][*]раз[*]два[/list]')
    const list = blocks[0]

    expect(list?.kind).toBe('list')
    expect(list?.kind === 'list' ? list.items.map(line) : []).toEqual(['раз', 'два'])
  })

  it('косметические теги уходят, текст остаётся', () => {
    expect(line(firstPara(parseRich('[color=#fff]цвет[/color]')))).toBe('цвет')
  })

  it('пустое описание — пустая разметка', () => {
    expect(parseRich(null)).toEqual([])
    expect(parseRich('   ')).toEqual([])
  })
})
