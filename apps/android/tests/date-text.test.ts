// Проверки ручного ввода даты. Маска собирается из того, что прислала клавиатура, а разбор обязан отвергнуть несуществующий день: поле молча съехало бы на соседний, и запись в списке стала бы
// врать.

import { describe, expect, it } from 'vitest'

import { dateCaret, dateDigits, maskDate, maskOf, stampDate } from '../src/app/date-text'

/** Края года — те же, что у календаря. */
const YEAR_MIN = 1940
const YEAR_MAX = 2028

describe('цифры набора', () => {
  it('берёт только цифры, что бы ни прислала клавиатура', () => {
    expect(dateDigits('24.05.2025')).toBe('24052025')
    expect(dateDigits(' 24 / 05 / 2025 ')).toBe('24052025')
    expect(dateDigits('')).toBe('')
    expect(dateDigits('нет даты')).toBe('')
  })
})

describe('маска ДД/ММ/ГГГГ', () => {
  it('ставит косую черту только вместе со следующей цифрой', () => {
    expect(maskDate('2')).toBe('2')
    expect(maskDate('24')).toBe('24')
    expect(maskDate('245')).toBe('24/5')
    expect(maskDate('2405')).toBe('24/05')
    expect(maskDate('24052')).toBe('24/05/2')
    expect(maskDate('24052025')).toBe('24/05/2025')
  })

  it('лишние цифры после года отбрасывает', () => {
    // Девятая цифра не должна ни удлинять год, ни уезжать в новую секцию.
    expect(maskDate('240520259')).toBe('24/05/2025')
  })

  it('чужие разделители не меняют порядок знаков', () => {
    expect(maskDate('24-05-2025')).toBe('24/05/2025')
    expect(maskDate('24 05 2025')).toBe('24/05/2025')
  })
})

describe('каретка', () => {
  it('считает позицию по цифрам, а не по знакам', () => {
    // Косые черты — оформление: правка в середине не должна перепрыгивать через них.
    expect(dateCaret('24/05/2025', 0)).toBe(0)
    expect(dateCaret('24/05/2025', 2)).toBe(3)
    expect(dateCaret('24/05/2025', 4)).toBe(6)
    expect(dateCaret('24/05/2025', 8)).toBe(10)
  })

  it('счёт за пределами строки встаёт в конец', () => {
    expect(dateCaret('24', 5)).toBe(2)
    expect(dateCaret('', 0)).toBe(0)
  })
})

describe('разбор в метку', () => {
  it('полная дата уходит в ГГГГ-ММ-ДД', () => {
    expect(stampDate('24/05/2025', YEAR_MIN, YEAR_MAX)).toBe('2025-05-24')
    expect(stampDate('01/01/2025', YEAR_MIN, YEAR_MAX)).toBe('2025-01-01')
  })

  it('дня, которого нет в месяце, не бывает', () => {
    expect(stampDate('31/04/2025', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('29/02/2025', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('00/05/2025', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('24/00/2025', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('24/13/2025', YEAR_MIN, YEAR_MAX)).toBeNull()
  })

  it('високосный февраль считает календарь', () => {
    expect(stampDate('29/02/2024', YEAR_MIN, YEAR_MAX)).not.toBeNull()
    // Двухтысячный кратен четырёмстам — високосный, в отличие от двухтысячнего первого.
    expect(stampDate('29/02/2000', YEAR_MIN, YEAR_MAX)).not.toBeNull()
  })

  it('недобранное и год вне краёв — не дата', () => {
    expect(stampDate('', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('24/05/202', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('01/01/1939', YEAR_MIN, YEAR_MAX)).toBeNull()
    expect(stampDate('01/01/2029', YEAR_MIN, YEAR_MAX)).toBeNull()
  })
})

describe('метка в маску', () => {
  it('собирает маску из ГГГГ-ММ-ДД', () => {
    expect(maskOf('2025-05-24')).toBe('24/05/2025')
  })

  it('пустая и чужая метки дают пустую маску', () => {
    expect(maskOf(null)).toBe('')
    expect(maskOf('')).toBe('')
    expect(maskOf('24.05.2025')).toBe('')
  })
})
