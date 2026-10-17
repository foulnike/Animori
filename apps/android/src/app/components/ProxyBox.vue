<script setup lang="ts">
// Прокси: настройка одна на программу, а каналов два — окно (ключи WebView2 в proxy.rs) и запросы из Rust и моста. Запросы подхватывают адрес сразу, окно — только с новым процессом: о перезапуске говорим, лишь когда правка что-то изменит.

import { computed, onMounted, ref } from 'vue'

import { proxyLiveCheck } from '@/api/proxy-check'
import { Bridge, type ProxyStatus } from '@/bridge'
import {
  DEFAULT_PROXY,
  isProxyUsable,
  normalizeProxyKind,
  normalizeProxyPort,
  type ProxyConfig,
  type ProxyKind,
} from '@/core/proxy'
import { proxyRestartNeeded, readProxyConfig, saveProxyField } from '@/core/proxy-settings'

import { restoreFocus } from '../focus-return'
import { isWeakPlatform } from '../platform'

import PickBox from './PickBox.vue'

/** Виды прокси: список один на панель, порядок строк задан здесь. Свой список, а не
 *  `<select>`: тот рисует оболочка, на тёмной теме выпадал белым. */
const KINDS: ReadonlyArray<{ key: ProxyKind; title: string }> = [
  { key: 'http', title: 'HTTP' },
  { key: 'socks5', title: 'SOCKS5' },
]

/** Слабая ли площадка — то есть телевизор. По ней строка-тумблер берёт фокус сама, а галочка внутри
 *  уходит из обхода: её мишень 54×30, а крестик окна стоит в правом углу шапки и не перекрывается. */
const lite = isWeakPlatform()

/** Значения на случай отсутствия ключа; до первого чтения поля не пустуют. */
const enabled = ref(DEFAULT_PROXY.enabled)
const kind = ref(DEFAULT_PROXY.kind)
const host = ref(DEFAULT_PROXY.host)
const login = ref(DEFAULT_PROXY.login)
const password = ref(DEFAULT_PROXY.password)
const bypass = ref(DEFAULT_PROXY.bypass)

/** Порт отдельной строкой, а не числом: поле можно стереть целиком, а normalizeProxyPort
 * превратил бы пустоту в ноль прямо под курсором. В настройки уходит разобранное число. */
const portDraft = ref(String(DEFAULT_PROXY.port))

/** Снимок запуска: из него и строка состояния, и ответ, нужен ли перезапуск —
 * адрес движок читает один раз, при создании окна. */
const status = ref<ProxyStatus | null>(null)

const error = ref('')

const checking = ref(false)
const checkText = ref('')
const checkOk = ref(false)

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Что записано сейчас, как это понимает остальной код. */
function currentConfig(): ProxyConfig {
  return {
    enabled: enabled.value,
    kind: kind.value,
    host: host.value.trim(),
    port: normalizeProxyPort(portDraft.value),
    login: login.value.trim(),
    password: password.value,
    bypass: bypass.value,
  }
}

/** Включённый тумблер с пустым или негодным адресом: трафик пойдёт напрямую. */
const badConfig = computed(() => enabled.value && !isProxyUsable(currentConfig()))

// Кнопка перезапуска показывается только там, где он что-то изменит. На приставке прокси окну недоступен вовсе (перезапуск лечит ключи WebView2): исход придёт windowUnsupported и кнопка встала бы навечно.
const needsRestart = computed(
  () =>
    !isWeakPlatform() && status.value !== null && proxyRestartNeeded(status.value, currentConfig()),
)

/** Пароль лежит в файле настроек открытым текстом — сказать об этом надо до ввода, а не после.
 * Условие «поле не пустое»: предупреждение на пустом поле читают один раз и больше не читают. */
const hasPassword = computed(() => password.value.length > 0)

/** SOCKS5 с логином: движок окна учётные данные для этого вида не принимает, а запросы
 * программы — принимает. Сказать стоит: иначе решат, что не работает вся настройка. */
const socksWithAuth = computed(() => kind.value === 'socks5' && login.value.trim().length > 0)

/** Строка состояния. */
const statusText = computed(() => {
  const s = status.value
  if (s === null) return 'читаем…'

  if (s.outcome === 'off') return 'при запуске прокси был выключен — трафик идёт напрямую'
  if (s.outcome === 'invalid') {
    return 'при запуске прокси был включён, но адрес негоден — трафик идёт напрямую'
  }
  if (s.outcome === 'unreachable')
    return `при запуске ${s.server} не ответил — трафик идёт напрямую`
  if (s.outcome === 'windowUnsupported') {
    // Не «не ответил»: адрес как раз ответил, и врать про него нельзя. Беда в платформе, и сказать надо ещё и о том, что тумблер не впустую: запросы программы через прокси идут, а страница — нет.
    return (
      `${s.server} отвечает, но окно на этой платформе прокси не умеет: ` +
      'запросы программы идут через него, страница — напрямую'
    )
  }

  if (s.auth === 'rejected') {
    return `${s.server} применён, но логин или пароль он не принял — страница останется пустой`
  }
  if (s.auth === 'pending') return `${s.server} применён, авторизация запрошена и ответа пока нет`
  if (s.auth === 'accepted') return `применён ${s.server}, авторизация пройдена`

  return `при запуске применён ${s.server}${s.hasCredentials ? ' (с логином)' : ''}`
})

async function loadConfig(): Promise<void> {
  try {
    const config = await readProxyConfig()

    enabled.value = config.enabled
    kind.value = config.kind
    host.value = config.host
    // Ноль значит «значения нет»: показать ноль — соврать про адрес.
    portDraft.value = config.port === 0 ? '' : String(config.port)
    login.value = config.login
    password.value = config.password
    bypass.value = config.bypass
  } catch (e) {
    error.value = 'Настройки не прочитаны — поля показывают значения по умолчанию. ' + describe(e)
  }
}

/** Снимок запуска; зовётся и по нажатию проверки — исход авторизации меняется по ходу. */
async function loadStatus(): Promise<void> {
  try {
    status.value = await Bridge.proxyDiagnostics.status()
  } catch (e) {
    // Без снимка строка состояния остаётся на «читаем…» навсегда, а кнопка перезапуска не появится ни при каких правках. Молчать об этом нельзя: человек решит, что настройка применилась.
    error.value = 'Состояние прокси неизвестно — перезапуск не предлагается. ' + describe(e)
  }
}

/** Приведение адреса к виду, какой ждёт движок: схему выбирает поле вида, и вставленное вместе
 * с адресом «http://» дало бы «http://http://host:port». Замыкающая косая черта отсекается так же. */
function cleanHost(): void {
  host.value = host.value
    .trim()
    .replace(/^\w+:\/\//, '')
    .replace(/\/+$/, '')
}

function onEnabled(): void {
  void saveProxyField('enabled', enabled.value)
}

/** Enter на строке-тумблере. Галочка внутри переключается с клавиатуры сама, а метка вокруг
 *  неё — нет: `<label>` щелчок мышью превращает в нажатие по полю, а Enter и пробел на себе  не разбирает. Переключаем значение сами и зовём тот же обработчик, что и по клику. */
function onSwitchKey(): void {
  enabled.value = !enabled.value
  onEnabled()
}

/** Выбор вида: нормализация и запись поля. Значение приходит строкой и нормализуется —
 *  чужое значение не должно лечь в файл настроек. */
function pickKind(next: string): void {
  const wanted = normalizeProxyKind(next)
  if (kind.value === wanted) return

  kind.value = wanted
  void saveProxyField('kind', kind.value)
}

function onHost(): void {
  cleanHost()
  void saveProxyField('host', host.value)
}

function onPort(): void {
  void saveProxyField('port', normalizeProxyPort(portDraft.value))
}

function onLogin(): void {
  login.value = login.value.trim()
  void saveProxyField('login', login.value)
}

/// Пароль не обрезается: пробел по краям в нём законен, а тихая правка дала бы отказ авторизации без единого слова о причине.
function onPassword(): void {
  void saveProxyField('password', password.value)
}

function onBypass(): void {
  void saveProxyField('bypass', bypass.value)
}

function onRestart(): void {
  void Bridge.shell.restart()
}

/** Проверка адреса в два шага, и оба нужны. Щуп открывает TCP-соединение («адрес слушает»),
 *  настоящий запрос — «пускают ли через него наружу». */
async function check(): Promise<void> {
  if (checking.value) return

  // Держатель запоминается до проверки: кнопка гаснет disabled и отдаёт фокус, а после проверки обход оставил бы пульт на крестике окна — мимо строки с разбором.
  const from = document.activeElement
  checking.value = true
  checkText.value = ''
  void loadStatus()

  try {
    const probe = await Bridge.proxyDiagnostics.probe()

    if (probe.outcome === 'off') {
      checkOk.value = false
      checkText.value = 'Прокси выключен — проверять нечего.'
      return
    }

    if (probe.outcome === 'invalid') {
      checkOk.value = false
      checkText.value = 'Адрес или порт заданы неверно — проверять нечего.'
      return
    }

    const reached = await proxyLiveCheck()

    if (probe.reachable && reached) {
      checkOk.value = true
      checkText.value = `Прокси ${probe.server} ответил за ${probe.latencyMs} мс, и запрос через него прошёл.`
    } else if (probe.reachable && !reached) {
      checkOk.value = false
      checkText.value = `Прокси ${probe.server} ответил, но наружу не пустил: проверьте логин, пароль и вид прокси.`
    } else if (!probe.reachable && reached) {
      checkOk.value = false
      checkText.value = `Прокси ${probe.server} не отвечает, а запрос всё равно прошёл — значит, он ушёл напрямую.`
    } else {
      checkOk.value = false
      checkText.value = `Прокси ${probe.server} не отвечает, и запрос не прошёл.`
    }
  } catch (e) {
    checkOk.value = false
    checkText.value = 'Проверка не удалась: ' + describe(e)
  } finally {
    checking.value = false
    restoreFocus(from)
  }
}

onMounted(() => {
  void loadConfig()
  void loadStatus()
})
</script>

<template>
  <div class="am-panel am-box">
    <h3 class="am-h3">Прокси</h3>

    <!-- Строка-тумблер на телевизоре берёт фокус сама, а галочка внутри из обхода убирается:
         мишенью с трёх метров служит вся строка, и «вверх» от неё находит крестик окна. -->
    <label
      class="am-switch"
      :tabindex="lite ? 0 : -1"
      role="switch"
      :aria-checked="enabled"
      @keydown.enter.prevent="onSwitchKey"
      @keydown.space.prevent="onSwitchKey"
    >
      <input
        v-model="enabled"
        :tabindex="lite ? -1 : 0"
        type="checkbox"
        class="am-switch__box"
        @change="onEnabled"
      />
      <span class="am-switch__name">Использовать прокси</span>
    </label>

    <!-- Вид и порт узкие, адрес забирает остаток строки: набирают его чаще всего. Вид — своим списком,
         а не `<select>` (список у того рисует оболочка, на тёмной теме выпадал белым); подпись невидимая, для читалок. -->
    <div class="am-row">
      <div class="am-field am-proxy__kind">
        <PickBox
          :model-value="kind"
          :items="KINDS"
          label="Вид прокси"
          @update:model-value="pickKind"
        />
      </div>

      <label class="am-field am-proxy__addr">
        <input
          v-model="host"
          v-tip="'Адрес без схемы: 127.0.0.1 или proxy.local'"
          class="am-input"
          type="text"
          placeholder="Адрес: 127.0.0.1 или proxy.local"
          @change="onHost"
        />
      </label>

      <label class="am-field am-proxy__port">
        <input
          v-model="portDraft"
          class="am-input"
          type="text"
          inputmode="numeric"
          placeholder="Порт"
          @change="onPort"
        />
      </label>
    </div>

    <div class="am-row">
      <label class="am-field">
        <input
          v-model="login"
          class="am-input"
          type="text"
          placeholder="Логин, если прокси его требует"
          @change="onLogin"
        />
      </label>

      <label class="am-field">
        <input
          v-model="password"
          class="am-input"
          type="password"
          placeholder="Пароль"
          @change="onPassword"
        />
      </label>
    </div>

    <!-- Обёртка по необходимости: у .am-field рост flex: 1 1 240px, и прямо в колонке панели это дало бы
         высоту 240px, из которых поле занимает верхушку. Все прочие поля стоят в .am-row. -->
    <div class="am-row">
      <label class="am-field">
        <input
          v-model="bypass"
          class="am-input"
          type="text"
          placeholder="Без прокси: localhost, 127.0.0.1"
          @change="onBypass"
        />
      </label>
    </div>

    <p class="am-meta">
      Адреса в обход прокси — через запятую или с новой строки. Пустое поле значит «через прокси
      идёт всё».
    </p>

    <p v-if="badConfig" class="am-warn">
      Прокси включён, но адрес или порт заданы неверно — трафик пойдёт напрямую.
    </p>

    <p v-if="hasPassword" class="am-warn">
      Пароль лежит в файле настроек открытым текстом: не вводите здесь пароль, который значит что-то
      ещё. Окно авторизуется у прокси само, второй раз его вводить не придётся.
    </p>

    <p v-if="socksWithAuth" class="am-warn">
      SOCKS5 с логином движок окна не поддерживает: страница пойдёт через такой прокси без
      авторизации и, скорее всего, получит отказ. Запросы AniMori логин и пароль используют, поэтому
      источники продолжат работать.
    </p>

    <!-- Строка состояния: подпись сверху, ответ снизу (длинный, переносится). -->
    <div class="am-proxy__state">
      <span class="am-proxy__name">Состояние</span>
      <span class="am-proxy__text">{{ statusText }}</span>
    </div>

    <p v-if="needsRestart" class="am-warn">
      Изменения сохранены и дойдут до окна только с новым запуском: ключи запуска движок читает один
      раз, при создании окна. Перезагрузка страницы здесь не поможет — она обновит разметку, а
      движок останется с прежним адресом.
    </p>

    <div class="am-row">
      <button class="am-btn am-btn--ghost" type="button" :disabled="checking" @click="check">
        {{ checking ? 'Проверяем…' : 'Проверить сейчас' }}
      </button>

      <button
        v-if="needsRestart"
        v-tip="'Перезапустить программу, чтобы новый адрес дошёл до окна'"
        class="am-btn"
        type="button"
        @click="onRestart"
      >
        Перезапустить
      </button>
    </div>

    <p v-if="checkText" :class="checkOk ? 'am-note' : 'am-error'">{{ checkText }}</p>
    <p v-if="error" class="am-error">{{ error }}</p>
  </div>
</template>

<style scoped src="../screens/settings-screen.css"></style>
