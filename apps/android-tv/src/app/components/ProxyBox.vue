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
import {
  proxyPasswordSet,
  proxyRestartNeeded,
  readProxyConfig,
  saveProxyField,
  saveProxyPassword,
} from '@/core/proxy-settings'

import { isWeakPlatform } from '../platform'

import SettingsSheet from './SettingsSheet.vue'

const KINDS: ReadonlyArray<{ key: ProxyKind; title: string }> = [
  { key: 'http', title: 'HTTP' },
  { key: 'socks5', title: 'SOCKS5' },
]

/** Значения на случай отсутствия ключа; до первого чтения поля не пустуют. */
const enabled = ref(DEFAULT_PROXY.enabled)
const kind = ref(DEFAULT_PROXY.kind)
const host = ref(DEFAULT_PROXY.host)
const login = ref(DEFAULT_PROXY.login)
/** Черновик пароля. Сохранённый пароль окно не получает: поле только для записи. */
const password = ref('')
/** Задан ли пароль в оболочке — единственное, что окно о нём знает. */
const passwordSet = ref(false)
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
const advanced = ref(false)
const advancedPage = ref(0)
const checkResultOpen = ref(false)
const checkButton = ref<HTMLButtonElement | null>(null)

function showAdvanced(): void {
  advancedPage.value = 0
  advanced.value = true
}

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

/** SOCKS5 с логином: движок окна учётные данные для этого вида не принимает, а запросы
 * программы — принимает. Сказать стоит: иначе решат, что не работает вся настройка. */
const socksWithAuth = computed(() => kind.value === 'socks5' && login.value.trim().length > 0)

/** Строка состояния. */
const statusText = computed(() => {
  const s = status.value
  if (s === null) return 'Нет данных'

  if (s.outcome === 'off') return 'Прокси выключен, трафик идёт напрямую'
  if (s.outcome === 'invalid') {
    return 'Неверный адрес прокси, трафик идёт напрямую'
  }
  if (s.outcome === 'unreachable') return `${s.server} не ответил, трафик идёт напрямую`
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

  return `Применён ${s.server}${s.hasCredentials ? ' (с логином)' : ''}`
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
    bypass.value = config.bypass
    passwordSet.value = await proxyPasswordSet()
  } catch (e) {
    error.value = 'Настройки не прочитаны — поля показывают значения по умолчанию. ' + describe(e)
  }
}

/** Снимок запуска; зовётся и по нажатию проверки — исход авторизации меняется по ходу. */
async function loadStatus(): Promise<void> {
  try {
    status.value = await Bridge.proxyDiagnostics.status()
  } catch (e) {
    error.value = 'Не удалось прочитать состояние прокси. ' + describe(e)
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

function toggleEnabled(): void {
  enabled.value = !enabled.value
  void saveProxyField('enabled', enabled.value)
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
  const draft = password.value
  if (draft === '') return

  void saveProxyPassword(draft).then((set) => {
    if (set === null) {
      error.value = 'Пароль прокси не сохранён — подробности в журнале.'
      return
    }
    passwordSet.value = set
    password.value = ''
  })
}

/** Стирает сохранённый пароль: пустое поле само по себе ничего не стирает. */
function onPasswordClear(): void {
  password.value = ''
  void saveProxyPassword('').then((set) => {
    if (set !== null) passwordSet.value = set
  })
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

  checking.value = true
  checkText.value = ''
  const startupStatus = loadStatus()

  try {
    const probe = await Bridge.proxyDiagnostics.probe()

    if (probe.outcome === 'off') {
      checkOk.value = false
      checkText.value = 'Прокси выключен.'
      return
    }

    if (probe.outcome === 'invalid') {
      checkOk.value = false
      checkText.value = 'Проверьте адрес и порт прокси.'
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
    await startupStatus
    checking.value = false
    checkResultOpen.value = true
  }
}

onMounted(() => {
  void loadConfig()
  void loadStatus()
})
</script>

<template>
  <div class="am-settings-content">
    <div class="am-settings-actions">
      <button
        class="am-btn am-proxy-switch"
        type="button"
        role="switch"
        :aria-checked="enabled"
        @click="toggleEnabled"
      >
        <span class="am-proxy-switch__track" aria-hidden="true" />
        Использовать прокси
      </button>
    </div>

    <div class="am-settings-fields am-proxy-address">
      <label class="am-settings-field">
        <span>Сервер</span>
        <input
          v-model="host"
          class="am-input"
          type="text"
          placeholder="127.0.0.1 или proxy.local"
          @change="onHost"
        />
      </label>
      <label class="am-settings-field">
        <span>Порт</span>
        <input
          v-model="portDraft"
          class="am-input"
          type="text"
          inputmode="numeric"
          @change="onPort"
        />
      </label>
    </div>

    <p v-if="badConfig" class="am-warn">
      Проверьте адрес и порт. Сейчас используется прямое подключение.
    </p>
    <p v-if="needsRestart" class="am-warn">Для применения настроек требуется перезапуск.</p>
    <div class="am-settings-actions">
      <button class="am-btn" type="button" :disabled="checking" @click="showAdvanced">
        Дополнительно
      </button>
      <button ref="checkButton" class="am-btn" type="button" :disabled="checking" @click="check">
        {{ checking ? 'Проверяем…' : 'Проверить прокси' }}
      </button>
      <button v-if="needsRestart" class="am-btn am-btn--soft" type="button" @click="onRestart">
        Перезапустить
      </button>
    </div>

    <SettingsSheet
      :open="advanced"
      v-model:page="advancedPage"
      :page-count="2"
      title="Дополнительные настройки прокси"
      icon="net"
      detail
      @close="advanced = false"
    >
      <template v-if="advancedPage === 0">
        <div class="am-settings-actions" role="group" aria-label="Вид прокси">
          <button
            v-for="item in KINDS"
            :key="item.key"
            class="am-btn"
            :class="{ 'am-btn--soft': kind === item.key }"
            :aria-pressed="kind === item.key"
            type="button"
            @click="pickKind(item.key)"
          >
            {{ item.title }}
          </button>
        </div>
        <div class="am-settings-fields">
          <label class="am-settings-field">
            <span>Логин</span>
            <input v-model="login" class="am-input" type="text" @change="onLogin" />
          </label>
          <label class="am-settings-field">
            <span>{{ passwordSet ? 'Новый пароль' : 'Пароль' }}</span>
            <input
              v-model="password"
              class="am-input"
              type="password"
              autocomplete="new-password"
              @change="onPassword"
            />
          </label>
        </div>
        <div v-if="passwordSet" class="am-settings-actions">
          <button class="am-btn" type="button" @click="onPasswordClear">Стереть пароль</button>
        </div>
        <p v-if="socksWithAuth" class="am-warn">
          Страницы приложения поддерживают SOCKS5 без авторизации. В запросах к источникам работают
          логин и пароль.
        </p>
      </template>
      <template v-else>
        <label class="am-settings-field">
          <span>Адреса в обход прокси</span>
          <input
            v-model="bypass"
            class="am-input"
            type="text"
            placeholder="localhost, 127.0.0.1"
            @change="onBypass"
          />
        </label>
        <p class="am-meta">Разделяйте адреса запятыми или переносами строк.</p>
      </template>
    </SettingsSheet>

    <SettingsSheet
      :open="checkResultOpen"
      :return-focus="() => checkButton"
      title="Проверка прокси"
      icon="net"
      detail
      compact
      @close="checkResultOpen = false"
    >
      <p v-if="checkText" :class="checkOk ? 'am-note' : 'am-error'" role="status">
        {{ checkText }}
      </p>
      <dl class="am-settings-facts">
        <div>
          <dt>Состояние при запуске</dt>
          <dd>{{ statusText }}</dd>
        </div>
      </dl>
      <p v-if="error" class="am-error" role="alert">{{ error }}</p>
    </SettingsSheet>
  </div>
</template>

<style scoped src="../screens/settings-screen.css"></style>

<style scoped>
.am-proxy-switch__track {
  display: flex;
  align-items: center;
  width: 36px;
  height: 20px;
  padding: 2px;
  background: var(--am-fill-3);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-cap);
}

.am-proxy-switch__track::before {
  width: 14px;
  height: 14px;
  content: '';
  background: var(--am-dim);
  border-radius: 50%;
}

.am-proxy-switch[aria-checked='true'] .am-proxy-switch__track {
  justify-content: flex-end;
  background: var(--am-accent-soft);
  border-color: var(--am-accent);
}

.am-proxy-switch[aria-checked='true'] .am-proxy-switch__track::before {
  background: var(--am-accent);
}

@media (min-width: 481px) {
  .am-proxy-address {
    grid-template-columns: minmax(0, 1fr) minmax(100px, 0.35fr);
  }
}
</style>
