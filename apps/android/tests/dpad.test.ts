// Проверки обхода фокуса стрелками. Обход целиком живёт на геометрии и `activeElement`, поэтому проверяем
// ровно те решения, что стоили человеку пульта: куда садится фокус и кого обход обходит стороной.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startDpad } from '../src/app/dpad'

/** Прямоугольник цели: happy-dom не рисует, а обход без геометрии не работает вовсе. */
function place(el: HTMLElement, x: number, y: number, w = 200, h = 48): void {
  el.getBoundingClientRect = () =>
    ({
      x,
      y,
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
    }) as DOMRect
}

let stop: (() => void) | null = null

/** Клавиша в окно: обход слушает `window`, а не документ. */
function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** Что сейчас в фокусе, коротко: для сообщений об ошибке. */
function focused(): string {
  const el = document.activeElement
  if (el === null || el === document.body) return '—'
  return el.getAttribute('data-test') ?? el.className ?? el.tagName
}

beforeEach(() => {
  document.body.innerHTML = ''
  stop = startDpad()
})

afterEach(() => {
  stop?.()
  stop = null
})

describe('обход стрелками в окне', () => {
  /** Окно как в SettingsSheet: шапка с крестиком, тело-контейнер и панель с кнопкой. */
  function window3(): HTMLElement {
    document.body.innerHTML = `
      <div class="am-sheet">
        <button class="am-sheet__veil"></button>
        <div class="am-sheet__box" role="dialog" aria-modal="true">
          <header>
            <button data-test="close" data-am-last></button>
          </header>
          <div class="am-sheet__body" tabindex="0" data-am-seed>
            <button data-test="go"></button>
          </div>
        </div>
      </div>`

    const sheet = document.querySelector<HTMLElement>('.am-sheet__box') as HTMLElement
    place(sheet, 0, 0, 880, 700)
    place(sheet.querySelector('.am-sheet__body') as HTMLElement, 0, 60, 880, 600)
    place(sheet.querySelector('[data-test="close"]') as HTMLElement, 820, 8, 52, 52)
    // Кнопка панели во всю ширину окна, как любая строка настроек: из-за узкой кнопки крестик не пересекался бы с ней по горизонтали, и «вверх» к выхону не вело бы вовсе.
    place(sheet.querySelector('[data-test="go"]') as HTMLElement, 40, 120, 832, 60)
    return sheet
  }

  it('фокус встаёт на кнопку панели, а не на крестик шапки', () => {
    window3()
    // Фокус пуст: WebView отпустил его, пока панель перерисовывалась.
    document.body.focus()
    press('ArrowDown')
    expect(focused()).toBe('go')
  })

  it('крестик остаётся целью: вверх от кнопки ведёт к выходу из окна', () => {
    window3()
    const go = document.querySelector<HTMLElement>('[data-test="go"]') as HTMLElement
    go.focus()
    press('ArrowUp')
    expect(focused()).toBe('close')
  })

  it('стрелка не проваливается в контейнер-тело окна', () => {
    window3()
    const go = document.querySelector<HTMLElement>('[data-test="go"]') as HTMLElement
    go.focus()
    // Тело окна ниже кнопки и перекрывает её собой по площади: без метки `data-am-seed` обход выбирал его как «ближайшего внизу», и подсветки на контейнере нет вовсе.
    press('ArrowDown')
    expect(focused()).not.toBe('.am-sheet__body')
  })
})

describe('ход по панели окна настроек', () => {
  /** Окно как в SettingsSheet, панель — как в ProxyBox: на телевизоре строки панели стоят
   *  колонкой (`.am-lite .am-row`), а верхние цели узки — тумблер и список вида прокси. */
  function panel(wideToggle: boolean): {
    toggle: HTMLElement
    close: HTMLElement
    kind: HTMLElement
  } {
    document.body.innerHTML = `
      <div class="am-sheet__box" role="dialog" aria-modal="true">
        <header><button data-test="close" data-am-last></button></header>
        <div class="am-sheet__body" tabindex="0" data-am-seed>
          ${
            wideToggle
              ? '<label data-test="toggle" tabindex="0" role="switch"></label>'
              : '<input data-test="toggle" type="checkbox" />'
          }
          <button data-test="kind"></button>
          <input data-test="host" type="text" />
          <input data-test="port" type="text" />
        </div>
        <footer><button data-test="done"></button></footer>
      </div>`

    const box = document.querySelector<HTMLElement>('.am-sheet__box') as HTMLElement
    const close = document.querySelector<HTMLElement>('[data-test="close"]') as HTMLElement
    const toggle = document.querySelector<HTMLElement>('[data-test="toggle"]') as HTMLElement
    const kind = document.querySelector<HTMLElement>('[data-test="kind"]') as HTMLElement
    const host = document.querySelector<HTMLElement>('[data-test="host"]') as HTMLElement
    const port = document.querySelector<HTMLElement>('[data-test="port"]') as HTMLElement
    const done = document.querySelector<HTMLElement>('[data-test="done"]') as HTMLElement

    place(box, 0, 0, 880, 700)
    place(close, 810, 10, 52, 52)
    // Строка-тумблер на телевизоре — во всю панель, а галочка внутри узка: крестик шапки стоит справа и по горизонтали с ней не перекрывается — на этом «вверх» и пропадало.
    place(toggle, 30, 110, wideToggle ? 820 : 54, wideToggle ? 56 : 30)
    place(kind, 30, 190, 99, 52)
    place(host, 30, 250, 820, 52)
    place(port, 30, 312, 820, 52)
    place(done, 20, 640, 840, 52)
    return { toggle, close, kind }
  }

  it('вверх от узкой строки панели ведёт к крестику шапки', () => {
    const { toggle } = panel(false)
    toggle.focus()
    press('ArrowUp')
    expect(focused()).toBe('close')
  })

  it('вверх от строки-тумблера во всю панель ведёт к крестику', () => {
    const { toggle } = panel(true)
    toggle.focus()
    press('ArrowUp')
    expect(focused()).toBe('close')
  })

  it('вниз с крестика ведёт к первой строке панели, а не в её середину', () => {
    const { close } = panel(true)
    close.focus()
    press('ArrowDown')
    expect(focused()).toBe('toggle')
  })

  it('вниз от узкой строки не проваливается в подвал окна', () => {
    const { toggle } = panel(false)
    toggle.focus()
    press('ArrowDown')
    expect(focused()).toBe('kind')
  })

  it('вверх в окне без крестика: цель без перекрытия по горизонтали всё равно находится', () => {
    document.body.innerHTML = `
      <div class="am-sheet__box" role="dialog">
        <button data-test="corner"></button>
        <div class="am-sheet__body" tabindex="0" data-am-seed>
          <input data-test="edge" type="text" />
        </div>
      </div>`

    const corner = document.querySelector<HTMLElement>('[data-test="corner"]') as HTMLElement
    const edge = document.querySelector<HTMLElement>('[data-test="edge"]') as HTMLElement
    place(corner, 600, 100, 60, 40)
    place(edge, 40, 300, 120, 52)

    edge.focus()
    press('ArrowUp')
    expect(focused()).toBe('corner')
  })

  it('вне окна последний проход не работает: страница ходит только по перекрытию', () => {
    document.body.innerHTML = `
      <button data-test="corner"></button>
      <button data-test="edge"></button>`

    const corner = document.querySelector<HTMLElement>('[data-test="corner"]') as HTMLElement
    const edge = document.querySelector<HTMLElement>('[data-test="edge"]') as HTMLElement
    place(corner, 600, 100, 60, 40)
    place(edge, 40, 300, 120, 52)

    edge.focus()
    press('ArrowUp')
    expect(focused()).toBe('edge')
  })

  it('отказ фокуса повторяется: нажатие не пропадает', async () => {
    const { toggle, kind } = panel(false)
    const real = kind.focus.bind(kind)
    let refuse = true

    // WebView вправе не принять фокус — узел перерисован, у списка только что сменилось значение. Фокус остаётся ни на ком (`body`): подсветки нет нигде, и человек жмёт стрелку второй раз.
    kind.focus = function (options?: FocusOptions) {
      if (refuse) {
        refuse = false
        document.body.focus()
        return
      }
      real(options)
    }

    toggle.focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(document.body)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(focused()).toBe('kind')
  })
})

describe('блокировка поля до Enter', () => {
  /** Панель из тумблера и поля: как в ProxyBox. */
  function proxy(): { toggle: HTMLElement; field: HTMLElement } {
    document.body.innerHTML = `
      <div class="am-sheet__box" role="dialog">
        <div class="am-sheet__body" tabindex="0" data-am-seed>
          <input data-test="toggle" type="checkbox" />
          <input data-test="field" type="text" />
        </div>
      </div>`

    const box = document.querySelector<HTMLElement>('.am-sheet__box') as HTMLElement
    const toggle = document.querySelector<HTMLElement>('[data-test="toggle"]') as HTMLElement
    const field = document.querySelector<HTMLElement>('[data-test="field"]') as HTMLElement
    place(box, 0, 0, 880, 700)
    place(toggle, 40, 100, 54, 30)
    place(field, 40, 160, 300, 40)
    return { toggle, field }
  }

  it('галочка не получает нашу блокировку: readOnly на checkbox не действует', () => {
    const { toggle } = proxy()
    toggle.focus()
    press('ArrowDown')

    // Обход считал галочку полем и вешал `data-am-held`; по Enter он снимал блокировку и перевзводил фокус через blur(), а WebView фокус не возвращал — пульт пропадал совсем.
    expect(toggle.hasAttribute('data-am-held')).toBe(false)
    expect((toggle as HTMLInputElement).readOnly).toBe(false)
    expect(focused()).toBe('field')
  })

  it('текстовое поле блокируется: клавиатура не должна подниматься сама', () => {
    const { field } = proxy()
    ;(document.querySelector('[data-test="toggle"]') as HTMLElement).focus()
    press('ArrowDown')

    expect(field.hasAttribute('data-am-held')).toBe(true)
    expect((field as HTMLInputElement).readOnly).toBe(true)
  })
})

describe('прыжок на рельс и между полками', () => {
  /** Главная целиком: полоса дней, две полки постера и рельс с пунктами. */
  function home(): void {
    document.body.innerHTML = `
      <div class="am-shell">
        <aside class="am-side">
          <nav class="am-side__menu">
            <button data-test="menu-home" class="am-side__item am-side__item--on"></button>
            <button data-test="menu-lists" class="am-side__item"></button>
            <button data-test="menu-settings" class="am-side__item"></button>
          </nav>
        </aside>

        <main class="am-view">
          <div class="am-view__hold">
            <section class="am-cal">
              <div class="am-cal__strip">
                <button data-test="day-1" data-am-first></button>
                <button data-test="day-2"></button>
              </div>
            </section>

            <section class="am-shelf">
              <ul class="am-rail" data-am-row>
                <li><button data-test="top-1"></button></li>
                <li><button data-test="top-2"></button></li>
                <li><button data-test="top-3"></button></li>
              </ul>
            </section>

            <section class="am-shelf">
              <ul class="am-rail" data-am-row>
                <li><button data-test="bot-1"></button></li>
                <li><button data-test="bot-2"></button></li>
                <li><button data-test="bot-3"></button></li>
              </ul>
            </section>

            <div class="am-sift" data-am-row>
              <button data-test="filters"></button>
              <button data-test="chip-1"></button>
              <button data-test="chip-2"></button>
            </div>

            <section class="am-shelf">
              <ul class="am-grid" data-am-row>
                <li><button data-test="feed-a1"></button></li>
                <li><button data-test="feed-a2"></button></li>
                <li><button data-test="feed-b1"></button></li>
                <li><button data-test="feed-b2"></button></li>
              </ul>
            </section>
          </div>
        </main>
      </div>`

    // Рельс: три пункта по вертикали, текущий — «Главная» (верхний).
    place(document.querySelector('.am-side') as HTMLElement, 0, 0, 80, 540)
    place(document.querySelector('[data-test="menu-home"]') as HTMLElement, 10, 40, 60, 40)
    place(document.querySelector('[data-test="menu-lists"]') as HTMLElement, 10, 100, 60, 40)
    place(document.querySelector('[data-test="menu-settings"]') as HTMLElement, 10, 160, 60, 40)

    // Полоса дней под шапкой, полки — ниже, одна под другой.
    place(document.querySelector('[data-test="day-1"]') as HTMLElement, 300, 40, 120, 40)
    place(document.querySelector('[data-test="day-2"]') as HTMLElement, 440, 40, 120, 40)

    const tops = [
      ['top-1', 300],
      ['top-2', 440],
      ['top-3', 580],
    ]
    tops.forEach(function ([name, x]) {
      place(
        document.querySelector(`[data-test="${name}"]`) as HTMLElement,
        x as number,
        140,
        120,
        180,
      )
    })

    const bots = [
      ['bot-1', 300],
      ['bot-2', 440],
      ['bot-3', 580],
    ]
    bots.forEach(function ([name, x]) {
      place(
        document.querySelector(`[data-test="${name}"]`) as HTMLElement,
        x as number,
        400,
        120,
        180,
      )
    })

    // Ряд отбора под полками: «Фильтры» левее чипов, и чипы стоят вровень с ней.
    place(document.querySelector('[data-test="filters"]') as HTMLElement, 300, 640, 140, 44)
    place(document.querySelector('[data-test="chip-1"]') as HTMLElement, 460, 640, 100, 44)
    place(document.querySelector('[data-test="chip-2"]') as HTMLElement, 580, 640, 100, 44)

    // Лента подбора: две строки сеткой, колонки тех же 140 px, что у полки.
    place(document.querySelector('[data-test="feed-a1"]') as HTMLElement, 300, 740, 140, 180)
    place(document.querySelector('[data-test="feed-a2"]') as HTMLElement, 460, 740, 140, 180)
    place(document.querySelector('[data-test="feed-b1"]') as HTMLElement, 300, 940, 140, 180)
    place(document.querySelector('[data-test="feed-b2"]') as HTMLElement, 460, 940, 140, 180)
  }

  function focusTest(name: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(`[data-test="${name}"]`) as HTMLElement
    el.focus()
    return el
  }

  it('прыжок влево с полки встаёт на текущий раздел, а не на соседний по высоте', () => {
    home()
    // С крайнего левого постера нижней полки. По геометрии влево встал бы «Настройки» — самый нижний пункт, то есть по счёту от нижней кромки: человек уходил в другой раздел молча.
    focusTest('bot-1')
    press('ArrowLeft')
    expect(focused()).toBe('menu-home')
  })

  it('прыжок влево уважает и вкладку, открытую не первой по порядку', () => {
    home()
    // Тот же прыжок, но открыт «Списки»: фокус обязан встать на него, а не на верхний пункт.
    const on = document.querySelector('[data-test="menu-home"]') as HTMLElement
    on.classList.remove('am-side__item--on')
    ;(document.querySelector('[data-test="menu-lists"]') as HTMLElement).classList.add(
      'am-side__item--on',
    )

    focusTest('bot-1')
    press('ArrowLeft')
    expect(focused()).toBe('menu-lists')
  })

  it('вниз между полками встаёт на крайний левый постер, а не на ближайший', () => {
    home()
    // Стоим на третьем постере верхней полки: по геометрии вниз встал бы третий нижней, и человек продолжал бы смотреть в тот же угол, за которым уже ходил.
    focusTest('top-3')
    press('ArrowDown')
    expect(focused()).toBe('bot-1')
  })

  it('вверх между полками то же: снова на крайний левый постер', () => {
    home()
    focusTest('bot-2')
    press('ArrowUp')
    expect(focused()).toBe('top-1')
  })

  it('внутри полки вправо-влево идёт по ряду, а не сбрасывается на край', () => {
    home()
    focusTest('top-1')
    press('ArrowRight')
    expect(focused()).toBe('top-2')
    press('ArrowRight')
    expect(focused()).toBe('top-3')
    // Обратно влево — на соседний постер, а не на первый: правило касается только прыжка между полками.
    press('ArrowLeft')
    expect(focused()).toBe('top-2')
  })

  it('смена полосы дней идёт по дням, а не по краю полки', () => {
    home()
    focusTest('day-1')
    press('ArrowRight')
    expect(focused()).toBe('day-2')
  })

  it('на ряд отбора вход сверху и снизу встаёт на «Фильтры», а не на чип', () => {
    home()
    // С полки вниз: по геометрии встал бы чип, минуя кнопку, с которой начинают набор условий.
    focusTest('bot-3')
    press('ArrowDown')
    expect(focused()).toBe('filters')

    // Обратно вверх — на крайний левый постер той полки, откуда пришли: кнопка фильтров левее любого постера, и «вверх» из неё ведёт на полку, а не на календарную строку.
    press('ArrowUp')
    expect(focused()).toBe('bot-1')
  })

  it('внутри ряда отбора вправо-влево идёт по чипам, а не сбрасывается на «Фильтры»', () => {
    home()
    focusTest('filters')
    press('ArrowRight')
    expect(focused()).toBe('chip-1')
    press('ArrowRight')
    expect(focused()).toBe('chip-2')
  })

  it('вход в сетку ленты — на её левый верхний постер', () => {
    home()
    // С ряда отбора вниз: колонки сетки теперь те же, что у полки, и вход идёт на крайний левый.
    focusTest('filters')
    press('ArrowDown')
    expect(focused()).toBe('feed-a1')
  })

  it('внутри сетки ленты вниз идёт по строкам, а не в левый угол', () => {
    home()
    // Второй постер верхней строки вниз — в ту же колонку следующей строки. Сброс в левый угел здесь ломал бы обход сетки: человек шёл бы по ней только первой колонкой.
    focusTest('feed-a2')
    press('ArrowDown')
    expect(focused()).toBe('feed-b2')
  })

  it('с края полки влево ведёт в рельс, а из середины — по своему ряду', () => {
    home()
    // Из середины ряда влево идёт сам ряд: до рельса оттуда не дойти, он за полкой.
    focusTest('bot-3')
    press('ArrowLeft')
    expect(focused()).toBe('bot-2')

    // С края — уже в рельс, и на текущий раздел.
    press('ArrowLeft')
    expect(focused()).toBe('bot-1')
    press('ArrowLeft')
    expect(focused()).toBe('menu-home')
  })

  it('посев приложения встаёт на помеченный день, а не на первый постер', () => {
    home()
    // Фокус пуст: приложение только что открыли, и вёл бы его оболочка.
    document.body.focus()
    press('ArrowDown')
    expect(focused()).toBe('day-1')
  })
})

describe('посев без помеченного первого', () => {
  it('на экране без метки всё как было: постер предпочтительнее', () => {
    document.body.innerHTML = `
      <div class="am-view">
        <div class="am-view__hold">
          <section class="am-shelf">
            <ul class="am-rail am-tile" data-am-row>
              <li><button data-test="tile"></button></li>
            </ul>
          </section>
        </div>
      </div>`

    const tile = document.querySelector<HTMLElement>('[data-test="tile"]') as HTMLElement
    place(tile, 300, 140, 200, 180)

    document.body.focus()
    press('ArrowDown')
    expect(focused()).toBe('tile')
  })
})
