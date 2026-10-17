// Ручной ввод даты: ДД/ММ/ГГГГ одной строкой. Поле не знает календаря — собирает маску из цифр и разбирает
// её обратно. Разбор намеренно строгий: восемь цифр и настоящий день, иначе `null` и поле не меняется.

/** Есть ли знак цифры. Сравнение с двумя краями читается на одном символе короче, чем regex. */
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** Все цифры строки в порядке появления: разделители, пробелы и прочее набранное с экранной
 *  клавиатуры отбрасываются на входе и не портят ни маску, ни разбор. */
export function dateDigits(text: string): string {
  let out = ''
  for (const ch of text) {
    if (isDigit(ch)) out += ch
  }
  return out
}

/** Маска из цифр: две на день, две на месяц, четыре на год. Недобранное хвостом не добирается —
 *  косая черта появляется только вместе со следующей цифрой, и поле не выглядит заполненным раньше времени. */
export function maskDate(text: string): string {
  const raw = dateDigits(text).slice(0, 8)
  if (raw.length <= 2) return raw

  const day = raw.slice(0, 2)
  const month = raw.slice(2, 4)
  if (raw.length <= 4) return `${day}/${month}`

  return `${day}/${month}/${raw.slice(4, 8)}`
}

/** Обратная сборка: метка ГГГГ-ММ-ДД → маска. Чужая строка — пустая маска, не ошибка. */
export function maskOf(iso: string | null): string {
  if (iso === null) return ''
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (hit === null) return ''
  return `${hit[3]}/${hit[2]}/${hit[1]}`
}

/** Позиция каретки после `count` цифр: счёт ведётся по цифрам, косые черты в него не идут,
 *  иначе правка в середине прыгала бы на конец строки. */
export function dateCaret(shown: string, count: number): number {
  let seen = 0
  for (let at = 0; at < shown.length; at += 1) {
    const ch = shown[at] ?? ''
    if (!isDigit(ch)) continue
    if (seen === count) return at
    seen += 1
  }
  return shown.length
}

/** Дата из маски в виде ГГГГ-ММ-ДД. `null` — набрано не всё, дня нет в месяце или год вне
 *  пределов (их задаёт вызывающий): пустое поле не годится, а несуществующий день молча  съехал бы на следующий. */
export function stampDate(text: string, yearMin: number, yearMax: number): string | null {
  const raw = dateDigits(text)
  if (raw.length !== 8) return null

  const year = Number(raw.slice(4, 8))
  const month = Number(raw.slice(2, 4))
  const day = Number(raw.slice(0, 2))

  if (year < yearMin || year > yearMax) return null
  if (month < 1 || month > 12) return null

  // Дней в месяце — из календаря, а не таблицы: високосный февраль считает сама дата.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > last) return null

  return `${raw.slice(4, 8)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`
}
