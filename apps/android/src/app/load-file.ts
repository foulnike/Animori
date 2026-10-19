// Загрузка файла ОТ человека. Путь один: системный пикер Storage Access Framework через
// Kotlin-мост AnimoriFiles (MainActivity.kt). Своего окна выбора у Android WebView нет:
// <input type="file"> молчит без onShowFileChooser в ChromeClient. Мост молчит вне
// приложения — в браузере (npm run dev:app) кнопка выбора просто вернёт null.

/** Выбранный файл, прочитанный в строку. */
export interface LoadedFile {
  /** Имя для весточек человеку: «Файл: animelist.xml». */
  name: string
  /** Содержимое текстом; gzip мост распаковал сам по подписи. */
  text: string
}

/** Мост из MainActivity.kt. Опционален: в браузере его нет. */
interface FilesBridge {
  pickXml: () => void
}

function bridge(): FilesBridge | null {
  const found = (window as unknown as { AnimoriFiles?: FilesBridge }).AnimoriFiles
  return found ?? null
}

/** Текущее ожидание выбора: один выбор — одно обещание. Повторное нажатие до ответа
 *  перепривязывается: старое обещание отпускается с null, висеть без ответа оно не будет. */
let waiting: ((file: LoadedFile | null) => void) | null = null

/** Ответ моста. Глобальная функция — её зовёт Kotlin силами evaluateJavascript. */
function onPicked(payload: unknown): void {
  const done = waiting
  waiting = null

  const file = payload as { name: string; text: string } | null
  done?.(file === null ? null : { name: file.name, text: file.text })
}

// Ставится до первого выбора: мост зовёт функцию, а не ждёт возврата.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __amFilesPicked?: (payload: unknown) => void }).__amFilesPicked =
    onPicked
}

/** Выбор файла родным пикером: null — передумали или моста нет. Отказ чтения приходит
 *  от моста как null: человек увидит ошибку разбора ниже, а не бесшовный провал. */
export function pickTextFile(_accept: string): Promise<LoadedFile | null> {
  const files = bridge()
  if (files === null) return Promise.resolve(null)

  // accept здесь ни на что не влияет: пикер показывает документы, а годится файл или нет,
  // решает разбор — тот же порядок, что на компьютере, где фильтр жил в <input accept>.
  return new Promise((resolve) => {
    waiting?.(null)
    waiting = resolve
    files.pickXml()
  })
}
