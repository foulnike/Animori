// Выгрузка списка системным пикером через мост AnimoriFiles (MainActivity.kt): <a download>
// в Android WebView молчит. Вне приложения мост отдаёт отказ с внятным текстом.

/** Куда в итоге лег файл. */
export interface SaveResult {
  /** Имя, которое человек увидел в пикере. Пустая строка — файла нет. */
  path: string
  /** Всегда true: на телефоне нет «скачиваний окна», файл ложится только по выбору. */
  toFolder: boolean
}

/** Мост из MainActivity.kt. Опционален: в браузере его нет. */
interface FilesBridge {
  saveXml: (name: string, text: string) => void
}

function bridge(): FilesBridge | null {
  const found = (window as unknown as { AnimoriFiles?: FilesBridge }).AnimoriFiles
  return found ?? null
}

/** Текущее ожидание записи: одно ожидание — одно обещание. */
let waiting: ((name: string | null) => void) | null = null

/** Ответ моста. Глобальная функция — её зовёт Kotlin силами evaluateJavascript. */
function onSaved(payload: unknown): void {
  const done = waiting
  waiting = null
  done?.(typeof payload === 'string' ? payload : null)
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __amFilesSaved?: (payload: unknown) => void }).__amFilesSaved = onSaved
}

/** Сохраняет выгрузку XML и говорит, под каким именем файл лег. Отмена пикера — отказ:
 *  молчание после нажатия и было дефектом, из-за которого файл искали по диску. */
export async function saveXmlFile(name: string, text: string): Promise<SaveResult> {
  const files = bridge()
  if (files === null) {
    throw new Error('Сохранение недоступно вне приложения.')
  }

  const saved = await new Promise<string | null>((resolve) => {
    waiting?.(null)
    waiting = resolve
    files.saveXml(name, text)
  })

  if (saved === null) throw new Error('Файл не сохранён.')

  return { path: saved, toFolder: true }
}
