<script setup lang="ts">
// На приставке нет входа в AniList, выгрузки в XML и плашки со звездой. Панели спрятаны за плитами мозаики: обход пульта получает шесть остановок, а панель открывается окном поверх экрана.

import { computed, onMounted, ref } from 'vue'

import { Bridge } from '@/bridge'
import {
  eachEntry,
  entryCount,
  forgetCollection,
  initCollection,
  pullFromMalFile,
  pullFromShikimori,
  refreshFromServer,
  unlinkCollection,
  type MalPullResult,
  type PullMode,
  type ShikiPullResult,
} from '@/core/collection'
import { datasetStatus, initDatasetNames } from '@/core/dataset-names'
import { clearCache, getDbStats } from '@/core/db'
import { adultByBirth } from '@/core/adult'
import { buildMalXml, malXmlFileName, parseMalXml } from '@/core/mal-xml'
import { clearHidden } from '@/core/recs'
import { saveSetting, settings } from '@/core/settings'
import { purgeAdultPick } from './home-keep'
import { cloudPathText } from '@/core/cloud'
import { APPEARANCES, appearance, setAppearance } from '../appearance'
import {
  authStatus,
  logout,
  refreshAuth,
  startLogin,
  submitToken,
  type LoginStart,
} from '../auth/session'
import { checkUpdate, installUpdate, updateOffer } from '../update'
import { pickTextFile } from '../load-file'
import { saveXmlFile } from '../save-file'
import BrandMark from '../components/BrandMark.vue'
import CloudBox from '../components/CloudBox.vue'
import CloudHelp from '../components/CloudHelp.vue'
import CreditsBox from '../components/CreditsBox.vue'
import DateField from '../components/DateField.vue'
import ProxyBox from '../components/ProxyBox.vue'
import SettingMark from '../components/SettingMark.vue'
import SettingsSheet from '../components/SettingsSheet.vue'
import { restoreFocus } from '../focus-return'
import { canOpenOutside, isWeakPlatform } from '../platform'
import { SAKURA_ROSETTE, SAKURA_ROSETTE_BOX } from '../sakura'

const version = __ANIMORI_VERSION__

/** Слабая ли площадка — то есть телевизор. По ней строка-тумблер берёт фокус сама,
 * а галочка внутри уходит из обхода: см. разметку тумблера. */
const lite = isWeakPlatform()

/// Человеку важна его система, а не имя нашей сборки: слово «app» ему не говорит ничего.
function systemName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'неизвестна'
}

const system = systemName()

/** Адрес датасета названий. Ссылка осталась и после ухода на CC0-1.0, но обязанностью
 * быть перестала: атрибуции эта лицензия не требует, а назвать источник кириллицы — вежливость. */
const DATASET_URL = 'https://github.com/foulnike/animori-data'

/// Внешние ссылки открываются только оболочкой: target="_blank" в WebView2 отбрасывается молча.
function onDatasetLink(): void {
  void Bridge.shell.openExternal(DATASET_URL)
}

/** Адрес репозитория и просьба при нём. В «О программе», а не окном при запуске:
 * окно на старте читается вымогательством. Звезда значит «пригодилось», issue — «сломалось»,
 * и обе вещи делаются в одном месте. */
const REPO_URL = 'https://github.com/foulnike/Animori'

function onRepoLink(): void {
  void Bridge.shell.openExternal(REPO_URL)
}

/** Есть ли куда вести ссылкам наружу. На телевизоре браузера нет, и обе кнопки уводили бы в никуда:
 * плашка репозитория снимается целиком, а имя датасета остаётся простым текстом. */
const outside = canOpenOutside()

// Ошибки показываются рядом с кнопкой, а не глотаются: молчаливый catch означал бы кнопку, которая не говорит почему.
const error = ref('')
const busy = ref(false)

// Сброс и удаление идут молча, и без явного ответа человек не поймёт, случилось ли что-нибудь.
const note = ref('')
const cleared = ref(false)

/** Спросено ли подтверждение удаления списка. Спрашивается всегда: местные записи
 * вернуть потом неоткуда, их нет ни на каком сервере. */
const askingDrop = ref(false)

/** Кнопка очистки памяти: запасная цель возврата фокуса после удаления списка —
 *  «Удалить» рядом с ней исчезает вместе с пустым списком. */
const clearBtn = ref<HTMLButtonElement | null>(null)

/** Ник на Шикимори. Списывается с памяти настроек один раз: общий объект настроек
 * не реактивен, и v-model по его полю не показал бы набранное. */
const shikiNick = ref(settings.shikiNick)

/** Кнопка переноса списка: запасная цель возврата фокуса после переноса — кнопки
 *  вопроса, с которых его начали, к этому времени нет в разметке. */
const shikiBtn = ref<HTMLButtonElement | null>(null)

/** Спрошено ли подтверждение переноса с Шикимори. Спрашивается по тем же причинам. */
const askingShiki = ref(false)

/** Занятость и ответы Шикимори держатся отдельно от общих busy/error/note. Перенос
 * списка идёт минутами, и общая занятость гасила бы кнопки своих данных. */
const shikiBusy = ref(false)
const shikiNote = ref('')
const shikiError = ref('')

/** Ответ Rust на нажатие «Подключить». Держится до входа или до ухода с экрана: из него
 * берётся срок ожидания для подсказки. На телефоне окно — системный браузер. */
const login = ref<LoginStart | null>(null)

/** Ручная вставка токена: запасной путь, когда браузер не открылся или пропуск не вернулся. */
const manual = ref('')
const manualOpen = ref(false)

/** Спрошено ли подтверждение переноса с AniList. Спрашивается всегда: замена вычищает
 * список целиком, включая набранное руками. */
const asking = ref(false)

/** Занятость и ответы переноса из файла MAL — отдельно: перенос долог и гасил бы чужие кнопки. */
const malBusy = ref(false)
const malNote = ref('')
const malError = ref('')

/** Выбранный файл, ждущий ответа на вопрос. Разбирается сразу при выборе: битый отказывает
 * сразу, а живой даёт число записей для текста вопроса. */
const malFile = ref<{ name: string; text: string; count: number } | null>(null)

/** Спрошено ли подтверждение переноса из файла. Спрашивается по той же причине. */
const askingMal = ref(false)

/** Страница выгрузки списка на MAL: входа в сервис у нас нет, файл забирается руками. */
const MAL_EXPORT_URL = 'https://myanimelist.net/panel.php?go=export'

function onMalExportLink(): void {
  void Bridge.shell.openExternal(MAL_EXPORT_URL)
}

/** Нажатие «Подключить»: сначала Rust поднимает приёмник, потом открывается браузер. */
function onLogin(): void {
  void guard(async () => {
    login.value = await startLogin()
  })
}

/** Отключение аккаунта: связь рвётся, список остаётся местным (3.16). */
function onLogout(): void {
  void guard(async () => {
    note.value = ''
    asking.value = false

    await logout()
    const left = await unlinkCollection()
    login.value = null
    await readState()

    note.value =
      left > 0 ? `Счёт отключён. Список остался здесь местным: записей ${left}.` : 'Счёт отключён.'
  })
}

/** Ручная вставка токена: тот же путь входа, только без браузера. */
function onManual(): void {
  void guard(async () => {
    await submitToken(manual.value)
    manual.value = ''
    manualOpen.value = false
    login.value = null
  })
}

/** Перенос списка с AniList одним из двух способов; зовётся только из подтверждения, никогда сам.
 * Итог говорится числами: после слияния важно не общее число, а что стало с набранным здесь. */
function onPull(mode: PullMode): void {
  asking.value = false

  void guard(async () => {
    note.value = ''
    const done = await refreshFromServer(mode)
    await readState()

    // Способ берётся из ответа, а не из просьбы: смена счёта переключает перенос на замену сама, и сказать надо о том, что случилось на деле.
    if (done.mode === 'replace') {
      note.value = `Список замещён списком с AniList: записей ${done.total}.`
      return
    }

    note.value =
      `Списки слиты: всего ${done.total}, новых ${done.added}, ` +
      `обновлено ${done.updated}, своих правок сохранено ${done.kept}, ` +
      `только здесь ${done.onlyHere}.`
  })
}

/** Нажатие на кнопку переноса: сначала вопрос, действие потом. */
function onAsk(): void {
  note.value = ''
  error.value = ''
  asking.value = true
}

function onCancel(): void {
  asking.value = false
}

/// Ожидание в минутах: секунды читать неудобно.
function waitText(seconds: number): string {
  return `${Math.round(seconds / 60)} мин`
}

/// Срок входа словами: «до» и дата читаются лучше, чем голая кучка секунд эпохи.
function expiryText(seconds: number | null): string {
  if (seconds === null) return 'срок неизвестен'
  return `до ${new Date(seconds * 1000).toLocaleDateString('ru-RU')}`
}

/** Выбор файла выгрузки: закрытое окно ошибкой не считается — null значит «передумал».
 * Битый XML отказывает сразу, живой даёт число записей в текст вопроса. */
function onMalPick(): void {
  malNote.value = ''
  malError.value = ''

  void (async () => {
    malBusy.value = true

    try {
      const loaded = await pickTextFile('.xml,.gz')
      if (loaded === null) return

      const count = parseMalXml(loaded.text).rows.length
      malFile.value = { name: loaded.name, text: loaded.text, count }
      askingMal.value = true
    } catch (e) {
      malError.value = describe(e)
    } finally {
      malBusy.value = false
    }
  })()
}

function onMalCancel(): void {
  askingMal.value = false
  malFile.value = null
}

/** Перенос списка из файла: способы те же два, и замена столь же беспощадна — вычищает
 * и перенесённое с AniList. Разобранный при выборе текст едет в перенос как есть:
 * копия в памяти, подменить её нечем. */
function onMalPull(mode: PullMode): void {
  askingMal.value = false

  const file = malFile.value
  malFile.value = null
  if (file === null) return

  void (async () => {
    malBusy.value = true
    malError.value = ''
    malNote.value = ''

    try {
      const done: MalPullResult = await pullFromMalFile(file.text, mode)
      await readState()

      malNote.value =
        done.mode === 'replace'
          ? `Список замещён списком из файла: записей ${done.total}.`
          : `Списки слиты: всего ${done.total}, новых ${done.added}, ` +
            `обновлено ${done.updated}, своих правок сохранено ${done.kept}, ` +
            `только здесь ${done.onlyHere}.`
    } catch (e) {
      malError.value = describe(e)
    } finally {
      malBusy.value = false
    }
  })()
}

/** Выгрузка списка файлом XML: формат чужой и старый, зато его понимают Шикимори, AniList,
 * Kitsu и сам MyAnimeList. Записи без номера MAL выразить нечем, и их число говорится вслух. */
function onExport(): void {
  void guard(async () => {
    note.value = ''
    await initCollection()

    const built = buildMalXml({ entries: eachEntry() })
    if (built.exported === 0) {
      note.value = 'Выгружать нечего: ни одной записи с закладкой и номером MAL.'
      return
    }

    const saved = await saveXmlFile(malXmlFileName(), built.xml)

    const lost = built.noMalId.length
    const tail = lost > 0 ? ` Без номера MAL осталось ${lost} — их в файле нет.` : ''

    note.value = `Выгружено записей: ${built.exported}. Файл: ${saved.path}${tail}`
  })
}

const listCount = ref(0)
const usedSize = ref('')

/** Состояние датасета названий строкой: журнала нет, видно хотя бы здесь. */
const datasetText = ref('')

/** Датасет старше STALE_DAYS. Отдельный признак, а не слово внутри строки: число дней
 * человек прочитает и не заметит, а подсветку — заметит. */
const datasetStale = ref(false)

/** Порог, после которого возраст датасета подсвечивается. Тридцать дней — это три
 * пропущенные недельные сборки: одна могла упасть случайно, три значат, что расписание уснуло. */
const STALE_DAYS = 30

/// Проверка обновления идёт прямо в панели «О программе»: окно поверх окна на пульте негде развернуть.
/// Состояние своё, а не общее с окном из рельса: рельс своё окно открывает сам.
const upBusy = ref(false)

/** Кнопка проверки обновления: запасная цель возврата фокуса, когда её саму не стало
 *  под курсором — ответ приходит, пока пульт стоит на крестике. */
const upBtn = ref<HTMLButtonElement | null>(null)

/** Слово проверки, когда сказать нечего: последняя версия, отказ GitHub или подсказка системе. */
const upNote = ref('')

/** Спрашивание GitHub. Неудача здесь не поломка: обновление просто не находится,
 *  и панель говорит это словами, а не молча. */
async function onUpCheck(): Promise<void> {
  const from = document.activeElement
  upBusy.value = true
  upNote.value = ''

  try {
    updateOffer.value = await checkUpdate()
    if (updateOffer.value === null) upNote.value = 'Обновлений нет — это последняя версия.'
  } catch {
    updateOffer.value = null
    upNote.value = 'Спросить не удалось: GitHub не ответил. Попробуйте позже.'
  } finally {
    upBusy.value = false
    // Кнопка гасла disabled, и пульт стоял на крестике: возвращаем его к ответу, который теперь читается строкой ниже.
    restoreFocus(from, () => upBtn.value)
  }
}

/** Отдаёт файл системе. false — прав на установку из неизвестных источников ещё нет:
 *  это ожидаемый первый шаг, а не отказ. */
function onUpInstall(): void {
  const offer = updateOffer.value
  if (offer === null) return

  if (!installUpdate(offer.url)) {
    upNote.value = 'Система попросит разрешить установку — разрешите и нажмите кнопку ещё раз.'
  }
}

/** Показ взрослого. Значение списывается с памяти настроек один раз:
 * общий объект настроек не реактивен, и v-model по его полю не дал бы ответа на клик. */
const adult = ref(settings.showAdult)

/** Открыт ли вопрос о возрасте. Взрослое включается не нажатием, а ответом на этот
 * вопрос: до него тумблер стоит выключенным. */
const askingAge = ref(false)

/** Дата рождения из поля ввода. Живёт только до ответа и никуда не пишется. */
const birth = ref('')

/** Слова отказа. Пустая строка — отказа нет. */
const ageError = ref('')

/** Плита мозаики: за каждой своё окно. */
type Door = 'list' | 'look' | 'data' | 'cloud' | 'net' | 'about'

/** Открытая плита. null — мозаика на виду. */
const openDoor = ref<Door | null>(null)

/** Открыта ли справка по переносу: кнопка «i» — в шапке модалки копии. */
const cloudHelp = ref(false)

/** Плиты мозаики: под каждой своё окно, и имя его называет. Подпись под именем убрана:
 *  плита держится на знаке и имени, а мелкая строка под заголовком на пульте только шумит. */
const doors = computed<ReadonlyArray<{ name: Door; title: string }>>(() => [
  { name: 'list', title: 'Импорт списка' },
  { name: 'look', title: 'Оформление' },
  { name: 'data', title: 'Данные' },
  { name: 'cloud', title: 'Копия списка' },
  { name: 'net', title: 'Прокси' },
  { name: 'about', title: 'О программе' },
])

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function guard(
  action: () => Promise<void>,
  fallback?: () => HTMLElement | null,
): Promise<void> {
  // Держатель запоминается до busy: кнопка станет disabled и отдаст фокус, а по возврате обход не вернёт его сам — ему не о ком вспомнить.
  const from = document.activeElement
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = describe(e)
  } finally {
    busy.value = false
    restoreFocus(from, fallback)
  }
}

/// Числа переспрашиваются после каждой кнопки: показанное должно совпадать с тем, что лежит внутри. Подъём обязателен: настройки открывают раньше списков.
async function readState(): Promise<void> {
  await initCollection()
  listCount.value = entryCount()

  const got = await getDbStats()
  usedSize.value = 'error' in got ? '' : got.estimatedSize

  // Датасет поднимается тем же общим обещанием, что и на старте: второй цены чтения здесь нет.
  await initDatasetNames()
  const ds = datasetStatus()
  if (ds.loaded && ds.builtAt !== null) {
    const date = new Date(ds.builtAt).toLocaleDateString('ru-RU')
    const count = ds.names.toLocaleString('ru-RU')
    const days = daysSince(ds.builtAt)

    // Возраст рядом с датой: дата отвечает «когда собран», а возраст — «пора ли дёргать репозиторий».
    const age = days === null ? '' : ` · ${ageText(days)}`
    datasetText.value = `${date} · ${count} записей${age}`
    datasetStale.value = days !== null && days > STALE_DAYS
  } else {
    datasetText.value = 'не загружен'
    datasetStale.value = false
  }
}

/// Копия из облака легла поверх списка: числа в панели данных пора переспросить. Своё состояние панель копии ведёт сама.
function onCloudChanged(): void {
  void readState()
}

/** Ник запоминается сразу по уходу из поля, а не только после переноса: набирать
 * его заново на телевизоре пультом — то ещё удовольствие. */
function onShikiNick(): void {
  const clean = shikiNick.value.trim()
  shikiNick.value = clean
  void saveSetting('shikiNick', 'am_shiki_nick', clean)
}

/** Нажатие на перенос с Шикимори: сначала вопрос, действие потом. */
function onShikiAsk(): void {
  shikiNote.value = ''
  shikiError.value = ''
  askingShiki.value = true
}

function onShikiCancel(): void {
  askingShiki.value = false
}

/** Потери словами. Тайтлы, которых нет у AniList, в список не попадают вовсе, и молчать
 * об этом нельзя: человек считает записи глазами и решит, что программа съела половину. */
function lostText(done: ShikiPullResult): string {
  if (done.lost === 0) return ''
  if (done.lostTitles.length === 0) return ` Без пары на AniList: ${done.lost}.`

  const more = done.lost > done.lostTitles.length ? ' и другие' : ''
  return ` Без пары на AniList ${done.lost}: ${done.lostTitles.join(', ')}${more}.`
}

/** Даты просмотра словами. Ноль здесь не поломка, а «просмотров не было»: у запланированного
 * тайтла дат и не бывает, и говорить об этом надо так, чтобы человек не пошёл искать ошибку. */
function datesText(done: ShikiPullResult): string {
  if (done.dated === 0) return ' Дат просмотра в журнале Шикимори не нашлось.'
  return ` Даты просмотра перенесены в ${done.dated} записей.`
}

/** Перенос списка с Шикимори по нику. Способы те же два, и вопрос тот же: замена вычищает
 * всё, включая перенесённое с AniList и добавленное руками. */
function onShikiPull(mode: PullMode): void {
  // Держатель — кнопка вопроса: она уходит из разметки в ту же секунду, вместе с вопросом, и без запоминания фокус после многоминутного переноса остался бы на крестике окна.
  const from = document.activeElement
  askingShiki.value = false

  void (async () => {
    shikiBusy.value = true
    shikiError.value = ''
    shikiNote.value = ''

    try {
      // Ник сохраняется до переноса, а не после: перенос долгий, и уйти с экрана посреди него человек вправе.
      onShikiNick()

      const done = await pullFromShikimori(shikiNick.value, mode)
      await readState()

      shikiNote.value =
        done.mode === 'replace'
          ? `Список замещён списком ${done.nick} с Шикимори: записей ${done.total}.` +
            lostText(done) +
            datesText(done)
          : `Списки слиты: всего ${done.total}, новых ${done.added}, ` +
            `обновлено ${done.updated}, своих правок сохранено ${done.kept}, ` +
            `только здесь ${done.onlyHere}.` +
            lostText(done) +
            datesText(done)
    } catch (e) {
      shikiError.value = describe(e)
    } finally {
      shikiBusy.value = false
      restoreFocus(from, () => shikiBtn.value)
    }
  })()
}

/** Нажатие на удаление списка: тоже только вопрос, без действия. */
function onAskDrop(): void {
  note.value = ''
  error.value = ''
  askingDrop.value = true
}

function onCancelDrop(): void {
  askingDrop.value = false
}

/** Удаление своего списка по прямой просьбе. Счёт при этом не трогается: список можно
 * стереть и перенести заново. На AniList это не отражается: удаляем только то, что у нас. */
function onDropList(): void {
  askingDrop.value = false

  void guard(
    async () => {
      note.value = ''
      await forgetCollection()
      await readState()
      note.value = 'Список удалён.'
    },
    // Кнопки вопроса к этому моменту нет, а своей «Удалить» тоже не будет — список пуст. Фокус остаётся в панели: на «Очистить память», единственной живой рядом.
    () => clearBtn.value,
  )
}

/** Переключение показа взрослого: отбор читает ключ в момент вопроса, перезапуск не нужен.
 * Исключение —
 * полки витрины: состав собран заранее, тумблер выбрасывает его через clearHidden. */
function onAdult(): void {
  if (!adult.value) {
    void saveSetting('showAdult', 'set_adult', false)
    void purgeAdultPick()
    void clearHidden()
    closeAge()
    return
  }

  adult.value = false
  birth.value = ''
  ageError.value = ''
  askingAge.value = true
}

/** Enter на строке-тумблере. Галочка внутри строки переключается с клавиатуры сама, а метка вокруг
 * неё
 * нет: `<label>` разбирает только щелчок мышью. Переключаем значение сами и зовём тот же обработчик. */
function onAdultKey(): void {
  adult.value = !adult.value
  onAdult()
}

/** Ответ поля даты. Пустая дата — «стёрли»: сказанный прежде отказ к пустому полю не относится. */
function onBirth(value: string): void {
  birth.value = value
  if (value === '') {
    ageError.value = ''
    return
  }

  if (!adultByBirth(value)) {
    ageError.value = 'В доступе отказано'
    return
  }

  closeAge()
  adult.value = true
  void saveSetting('showAdult', 'set_adult', true)
  void clearHidden()
}

/** Отказ от вопроса: тумблер остаётся выключенным, и это его настоящее состояние. */
function closeAge(): void {
  askingAge.value = false
  birth.value = ''
  ageError.value = ''
}

// Память сбрасывается только руками. Перезагрузка не делается сама: человек может быть в середине правок.
function onClear(): void {
  void guard(async () => {
    note.value = ''
    await clearCache()
    cleared.value = true
    await readState()
    note.value = 'Память очищена. Названия и описания загрузятся заново.'
  })
}

function onReload(): void {
  void Bridge.shell.reload()
}

/// Возраст сборки в днях. null — когда дата не читается: «NaN дней назад» хуже, чем отсутствие возраста.
function daysSince(iso: string): number | null {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 86400000)
}

/// Возраст словами: «собран сегодня», «1 день назад», «6 дней назад». Развёрнуто, а не вложенными тернарниками: падежи русских числительных в одну строку не читаются.
function ageText(days: number): string {
  if (days <= 0) return 'собран сегодня'

  const tail = days % 100
  const last = days % 10
  let word = 'дней'
  if (tail < 11 || tail > 19) {
    if (last === 1) word = 'день'
    else if (last >= 2 && last <= 4) word = 'дня'
  }

  return `${days} ${word} назад`
}

onMounted(() => {
  void readState()

  // Состояние входа нужно списку и панели: без него запросы идут без подписи. Ошибка не роняет запуск: без входа приложение работает.
  void refreshAuth().catch((e: unknown) => {
    error.value = describe(e)
  })
})
</script>

<template>
  <section class="am-page am-set">
    <!-- Мозаика плит: шесть плит вместо длинной колонки панелей. Обход пульта получает шесть
     остановок вместо пятнадцати, а знакомая панель открывается окном поверх экрана. -->
    <div class="am-doors">
      <button
        v-for="item in doors"
        :key="item.name"
        class="am-door"
        type="button"
        @click="openDoor = item.name"
      >
        <!-- Цветок-подложка: та же розетка, что на плитках статистики ПК-билда, под
             подписью и срезанная углом плитки (см. settings-screen.css). -->
        <span class="am-door__flower" aria-hidden="true">
          <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
        </span>
        <span class="am-door__mark"><SettingMark :name="item.name" /></span>
        <span class="am-door__name">{{ item.title }}</span>
      </button>
    </div>

    <!-- Окна: по одному на плиту, поднимаются по нажатию. Панели внутри — те же, что стояли колонкой,
     и заголовок окну даёт заголовок панели. -->
    <SettingsSheet :open="openDoor === 'list'" title="Импорт списка" @close="openDoor = null">
      <!-- Импорт списка. Три источника: AniList со входом (на телефоне браузер системный,
     пропуск возвращается в приёмник приложения), Шикимори по нику и файл выгрузки.
     Знаки берёт components/BrandMark.vue из brand/*.svg. -->
      <div class="am-panel am-box">
        <h3 class="am-h3">Импорт списка</h3>

        <!-- AniList. Вход тем же способом, что на компьютере: Rust поднимает приёмник
             на 127.0.0.1 и отдаёт адрес системному браузеру. -->
        <div class="am-serv">
          <div class="am-serv__head">
            <BrandMark class="am-serv__logo" name="anilist" />

            <span class="am-serv__text">
              <span class="am-serv__name">AniList</span>
              <span class="am-serv__note">
                {{
                  authStatus.authorized
                    ? `Подключён ${expiryText(authStatus.expiresAt)}.`
                    : 'Нужен вход в аккаунт.'
                }}
              </span>
            </span>

            <span class="am-flag" :class="{ 'am-flag--on': authStatus.authorized }">
              <span class="am-flag__dot" aria-hidden="true" />
              {{ authStatus.authorized ? 'подключён' : 'не подключён' }}
            </span>
          </div>

          <div class="am-row">
            <button
              v-if="!authStatus.authorized"
              class="am-btn"
              type="button"
              :disabled="busy"
              @click="onLogin"
            >
              Подключить аккаунт
            </button>

            <template v-else>
              <button class="am-btn" type="button" :disabled="busy" @click="onAsk">
                {{ busy ? 'Переносим…' : 'Перенести список' }}
              </button>
              <button class="am-btn am-btn--ghost" type="button" :disabled="busy" @click="onLogout">
                Отключить
              </button>
            </template>

            <button
              v-if="!authStatus.authorized"
              class="am-btn am-btn--ghost"
              type="button"
              @click="manualOpen = !manualOpen"
            >
              Ввести токен
            </button>
          </div>

          <!-- Вопрос перед переносом: одно число и два способа рядом. Разницу говорят подписи
           кнопок, поэтому абзац объяснений здесь убран — он повторял их втрое длиннее. -->
          <div v-if="asking" class="am-ask">
            <p class="am-ask__text">Записей: {{ listCount }}.</p>

            <div class="am-row">
              <button class="am-btn" type="button" :disabled="busy" @click="onPull('merge')">
                Добавить недостающее
              </button>
              <button
                class="am-btn am-btn--ghost"
                type="button"
                :disabled="busy"
                @click="onPull('replace')"
              >
                Заменить целиком
              </button>
              <button class="am-btn am-btn--ghost" type="button" @click="onCancel">Отмена</button>
            </div>
          </div>

          <!-- Показывается только после нажатия: до него ждать нечего. -->
          <p v-if="login && !authStatus.authorized" class="am-meta">
            Браузер открыт, после разрешения вернитесь в приложение. Ожидание —
            {{ waitText(login.waitSecs) }}.
          </p>

          <div v-if="manualOpen && !authStatus.authorized" class="am-row">
            <label class="am-field">
              <input v-model="manual" class="am-input" type="text" placeholder="Токен AniList" />
            </label>
            <button
              class="am-btn"
              type="button"
              :disabled="busy || !manual.trim()"
              @click="onManual"
            >
              Сохранить
            </button>
          </div>

          <p v-if="error" class="am-error">{{ error }}</p>
        </div>

        <div class="am-serv">
          <div class="am-serv__head">
            <BrandMark class="am-serv__logo" name="shikimori" />

            <span class="am-serv__text">
              <span class="am-serv__name">Шикимори</span>
              <span class="am-serv__note">Профиль на Шикимори должен быть открытым.</span>
            </span>
          </div>

          <div class="am-row">
            <label class="am-field">
              <input
                v-model="shikiNick"
                class="am-input"
                type="text"
                placeholder="Ник на Шикимори"
                :disabled="shikiBusy"
                @change="onShikiNick"
              />
            </label>
            <button
              v-tip="'Забрать список с Шикимори: слиянием или с заменой'"
              ref="shikiBtn"
              class="am-btn"
              type="button"
              :disabled="shikiBusy || !shikiNick.trim()"
              @click="onShikiAsk"
            >
              {{ shikiBusy ? 'Переносим…' : 'Перенести список' }}
            </button>
          </div>

          <!-- Вопрос перед переносом: замена вычищает список целиком, включая набранное руками, — такое не делают одним промахом пульта. -->
          <div v-if="askingShiki" class="am-ask">
            <p class="am-ask__text">Записей: {{ listCount }}.</p>

            <div class="am-row">
              <button
                class="am-btn"
                type="button"
                :disabled="shikiBusy"
                @click="onShikiPull('merge')"
              >
                Добавить недостающее
              </button>
              <button
                class="am-btn am-btn--ghost"
                type="button"
                :disabled="shikiBusy"
                @click="onShikiPull('replace')"
              >
                Заменить целиком
              </button>
              <button class="am-btn am-btn--ghost" type="button" @click="onShikiCancel">
                Отмена
              </button>
            </div>
          </div>

          <p v-if="shikiNote" class="am-note">{{ shikiNote }}</p>
          <p v-if="shikiError" class="am-error">{{ shikiError }}</p>
        </div>

        <!-- MyAnimeList: знак из brand/myanimelist.svg; входа нет и не будет: список приезжает
             файлом выгрузки; тот же файл отдаёт Шикимори — формат MAL до тега. -->
        <div class="am-serv">
          <div class="am-serv__head">
            <BrandMark class="am-serv__logo" name="myanimelist" />

            <span class="am-serv__text">
              <span class="am-serv__name">MyAnimeList</span>
              <span class="am-serv__note">
                Перейдите
                <button v-if="outside" class="am-link" type="button" @click="onMalExportLink">
                  сюда
                </button>
                <span v-else>сюда</span>
                → «Export my anime list».
              </span>
            </span>
          </div>

          <div class="am-row">
            <button class="am-btn" type="button" :disabled="malBusy" @click="onMalPick">
              {{ malBusy ? 'Переносим…' : 'Выбрать файл' }}
            </button>
          </div>

          <!-- Вопрос тот же, что у AniList и Шикимори, и по той же причине: замена вычищает
           список целиком. -->
          <div v-if="askingMal && malFile" class="am-ask">
            <p class="am-ask__text">
              Файл: {{ malFile.name }}, записей в нём {{ malFile.count }}. Записей у вас:
              {{ listCount }}.
            </p>

            <div class="am-row">
              <button class="am-btn" type="button" :disabled="malBusy" @click="onMalPull('merge')">
                Добавить недостающее
              </button>
              <button
                class="am-btn am-btn--ghost"
                type="button"
                :disabled="malBusy"
                @click="onMalPull('replace')"
              >
                Заменить целиком
              </button>
              <button class="am-btn am-btn--ghost" type="button" @click="onMalCancel">
                Отмена
              </button>
            </div>
          </div>

          <p v-if="malNote" class="am-note">{{ malNote }}</p>
          <p v-if="malError" class="am-error">{{ malError }}</p>
        </div>
      </div>
    </SettingsSheet>

    <SettingsSheet :open="openDoor === 'data'" title="Данные" @close="openDoor = null">
      <!-- Данные: что лежит на этом диске и что с этим можно сделать. -->
      <div class="am-panel am-box">
        <h3 class="am-h3">Данные</h3>

        <ul class="am-facts">
          <li class="am-fact">
            <span class="am-fact__name">Записей в списке</span>
            <span class="am-fact__value">{{ listCount }}</span>
          </li>
          <li v-if="usedSize" class="am-fact">
            <span class="am-fact__name">Занято на диске</span>
            <span class="am-fact__value">{{ usedSize }}</span>
          </li>
        </ul>

        <!-- Необратимое одной строкой: сброс памяти и удаление списка стоят рядом, потому что оба про этот диск. -->
        <div class="am-row">
          <!-- Выгрузка списка файлом XML: формат чужой и старый, зато его понимают Шикимори, AniList, Kitsu и сам MyAnimeList. Куда ложить файл, спрашивает система родным пикером. -->
          <button class="am-btn" type="button" :disabled="busy" @click="onExport">
            Выгрузить в XML
          </button>

          <button
            v-tip="'Убрать сохранённые названия, описания и обложки'"
            ref="clearBtn"
            class="am-btn am-btn--ghost"
            type="button"
            :disabled="busy"
            @click="onClear"
          >
            Очистить память
          </button>

          <button
            v-if="listCount > 0"
            v-tip="'Удалить свой список с этого устройства'"
            class="am-btn am-btn--ghost"
            type="button"
            :disabled="busy"
            @click="onAskDrop"
          >
            Удалить мой список
          </button>

          <button v-if="cleared" class="am-btn am-btn--ghost" type="button" @click="onReload">
            Перезагрузить
          </button>
        </div>

        <!-- Удаление списка необратимо для местных записей: спрашиваем всегда. Вопрос коротким: подпись кнопки под ним и есть ответ. -->
        <div v-if="askingDrop" class="am-ask">
          <p class="am-ask__text">Удалить список с этого устройства?</p>

          <div class="am-row">
            <button class="am-btn" type="button" :disabled="busy" @click="onDropList">
              Удалить список
            </button>
            <button class="am-btn am-btn--ghost" type="button" @click="onCancelDrop">Отмена</button>
          </div>
        </div>

        <p v-if="note" class="am-note">{{ note }}</p>
        <p v-if="error" class="am-error">{{ error }}</p>
      </div>
    </SettingsSheet>

    <!-- Копия списка: на телевизоре от неё остался один путь — забрать копию по ссылке. -->
    <SettingsSheet :open="openDoor === 'cloud'" title="Копия списка" @close="openDoor = null">
      <template #tools>
        <button
          class="am-help-i"
          type="button"
          aria-label="Как получить ссылку"
          @click="cloudHelp = true"
        >
          i
        </button>
      </template>

      <CloudBox :list="listCount" :device="system" @changed="onCloudChanged" />
    </SettingsSheet>

    <CloudHelp :open="cloudHelp" :path="cloudPathText()" @close="cloudHelp = false" />

    <SettingsSheet :open="openDoor === 'look'" title="Оформление" @close="openDoor = null">
      <div class="am-panel am-box">
        <h3 class="am-h3">Оформление</h3>

        <div class="am-skins">
          <button
            v-for="item in APPEARANCES"
            :key="item.name"
            v-tip="item.hint"
            class="am-skins__btn"
            :class="{ 'am-skins__btn--on': item.name === appearance }"
            type="button"
            @click="setAppearance(item.name)"
          >
            <span class="am-skins__mark" aria-hidden="true">{{ item.mark }}</span>
            <span class="am-skins__name">{{ item.title }}</span>
          </button>
        </div>

        <!-- Строка-тумблер на телевизоре сама берёт фокус, а галочка внутри из обхода убирается: обход
     пульта ищет соседа по геометрии, и рядом с тумблером по горизонтали нет ничего, что его перекрывало бы. -->
        <label
          class="am-switch"
          :tabindex="lite ? 0 : -1"
          role="switch"
          :aria-checked="adult"
          @keydown.enter.prevent="onAdultKey"
          @keydown.space.prevent="onAdultKey"
        >
          <input
            v-model="adult"
            type="checkbox"
            class="am-switch__box"
            :tabindex="lite ? -1 : 0"
            @change="onAdult"
          />
          <span class="am-switch__name">Показывать контент для взрослых (18+)</span>
        </label>

        <!-- Вопрос о возрасте стоит под тумблером, а не отдельным окном: он живёт ровно столько,
     сколько человек его видит. Поле даты своё: системное на тёмных темах выбивалось из стекла. -->
        <div v-if="askingAge" class="am-age">
          <p class="am-age__ask">Укажите ваш возраст</p>

          <DateField
            :value="birth"
            title="Дата рождения"
            :show-today="false"
            :inline-wipe="true"
            @pick="onBirth"
          />

          <p v-if="ageError" class="am-error">{{ ageError }}</p>

          <button class="am-btn am-btn--soft am-age__back" type="button" @click="closeAge">
            Отмена
          </button>
        </div>
      </div>
    </SettingsSheet>

    <!-- Прокси: у панели своё состояние и свой разговор с оболочкой, потому и своё окно. -->
    <SettingsSheet :open="openDoor === 'net'" title="Прокси" @close="openDoor = null">
      <ProxyBox />
    </SettingsSheet>

    <!-- О программе — последнее окно: здесь только то, что читают один раз, — версия, система,
     датасет и лицензия. -->
    <SettingsSheet :open="openDoor === 'about'" title="О программе" @close="openDoor = null">
      <div class="am-panel am-box">
        <h3 class="am-h3">О программе</h3>

        <ul class="am-facts">
          <li class="am-fact">
            <span class="am-fact__name">Версия</span>
            <span class="am-fact__value">{{ version }}</span>
          </li>
          <li class="am-fact">
            <span class="am-fact__name">Система</span>
            <span class="am-fact__value">{{ system }}</span>
          </li>
          <li class="am-fact">
            <span class="am-fact__name">Датасет названий</span>
            <span class="am-fact__value" :class="{ 'am-fact__value--stale': datasetStale }">
              {{ datasetText }}
            </span>
          </li>
        </ul>

        <!-- Проверка обновления кнопкой прямо в панели, а не отдельным окном: окно поверх окна
     на пульте негде развернуть. Одна кнопка ведёт и проверку, и установку — по состоянию. -->
        <button
          ref="upBtn"
          class="am-btn am-btn--soft am-up"
          :class="{ 'am-up--new': updateOffer !== null }"
          type="button"
          :disabled="upBusy"
          @click="updateOffer !== null ? onUpInstall() : onUpCheck()"
        >
          {{
            upBusy
              ? 'Спрашиваем GitHub…'
              : updateOffer
                ? `Обновление до ${updateOffer.version}`
                : 'Проверить обновление'
          }}
        </button>

        <p v-if="upNote" class="am-note">{{ upNote }}</p>

        <!-- Плашки с просьбой о звезде здесь больше нет: она вела на GitHub, а ссылку наружу на телевизоре открыть нечем. -->

        <!-- Имя источника, лицензия и ссылка. Обязанностью строка быть перестала: CC0-1.0 атрибуции
     не требует. Манами из цепочки убрана 3 сентября 2026 — номера теперь свои. -->
        <p class="am-meta am-fine">
          Русские названия поставляет датасет
          <button v-if="outside" class="am-link" type="button" @click="onDatasetLink">
            animori-data</button
          ><span v-else class="am-meta">animori-data</span>
          (лицензия CC0-1.0): номера и связки собраны перечислением каталога Шикимори, сами названия
          — из открытого API Шикимори.
        </p>

        <!-- Свежесть датасета — единственное, за чем человеку приходится следить руками, поэтому про просрочку говорим словами. -->
        <p v-if="datasetStale" class="am-stale">
          Датасет не обновлялся больше {{ STALE_DAYS }} дней. Названия, которых в нём нет, программа
          добирает из сети по одному — это медленно. Загляните в
          <button v-if="outside" class="am-link" type="button" @click="onDatasetLink">
            animori-data</button
          ><span v-else class="am-meta">animori-data</span>
          и запустите сборку кнопкой.
        </p>

        <!-- Плашка репозитория: не строка заметок, а приглашение — свой фон и своё сердце,
             нажимается вся плашка. Почему именно здесь — у REPO_URL в скрипте. -->
        <button class="am-repo" type="button" @click="onRepoLink">
          <svg class="am-repo__heart" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <!-- Градиент сердцу задан классами: stop-color через var() в атрибуте не читается. -->
            <defs>
              <linearGradient
                id="am-repo-heart"
                x1="2.4"
                y1="2.4"
                x2="13.6"
                y2="13.6"
                gradientUnits="userSpaceOnUse"
              >
                <stop class="am-repo__stop" offset="0" />
                <stop class="am-repo__stop am-repo__stop--end" offset="1" />
              </linearGradient>
            </defs>
            <path
              fill="url(#am-repo-heart)"
              d="M8 14.1S1.9 10.3 1.9 6.1C1.9 3.9 3.7 2.4 5.5 2.4 6.8 2.4 7.6 3.1 8 4c.4-.9 1.2-1.6 2.5-1.6 1.8 0 3.6 1.5 3.6 3.7 0 4.2-6.1 8-6.1 8Z"
            />
          </svg>

          <span class="am-repo__text">
            AniMori — бесплатное приложение, без рекламы и телеметрии. Если вам понравилось —
            поставьте звёздочку, если что-то сломалось — оставьте issue в репозитории.
          </span>
        </button>

        <!-- Источники и права — последнее в окне: дальше читать нечего. -->
        <CreditsBox />
      </div>
    </SettingsSheet>
  </section>
</template>

<style scoped src="./settings-screen.css"></style>
