/** Сверяет конфигурации, которые правятся в нескольких местах, но обязаны совпадать.
 *
 *  Команды оболочки: аннотация #[tauri::command] → generate_handler → build.rs → capability.
 *  Алиасы: vite.config → tsconfig → tsconfig.shared → vitest.config.
 *  Запуск: npm run sync:check (в CI). Exit 1 — есть расхождение. */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'

// Варнант загрузчика корневого vitest-конфига (CJS-окружение) в CI не нужен.
process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['windows', 'android-tv', 'android']
const errors = []

const read = (...parts) => readFileSync(join(...parts), 'utf8')
const push = (message) => errors.push(message)

/** Комментарии и висячие запятые JSONC. Строки не трогаем: в них бывают и //, и запятые. */
function jsonc(text) {
  let out = ''
  let i = 0
  let str = false
  while (i < text.length) {
    const c = text[i]
    if (str) {
      out += c
      if (c === '\\') {
        out += text[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === '"') str = false
      i++
      continue
    }
    if (c === '"') {
      str = true
      out += c
      i++
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === '}' || text[j] === ']') {
        i++
        continue
      }
    }
    out += c
    i++
  }
  return out
}

const baseKey = (key) => (key.endsWith('/*') ? key.slice(0, -2) : key)
const normTarget = (dir, target) =>
  normalize(resolve(dir, target.endsWith('/*') ? target.slice(0, -2) : target))
const nameOf = (allow) => `animori_${allow.slice('allow-animori-'.length).replaceAll('-', '_')}`

/** Четыре вида одного списка команд на платформу. */
function commandSets(app) {
  const dir = join(root, 'apps', app, 'src-tauri')
  const src = join(dir, 'src')

  const annotated = new Set()
  for (const file of readdirSync(src).filter((name) => name.endsWith('.rs'))) {
    for (const chunk of read(src, file).split('#[tauri::command]').slice(1)) {
      const match = chunk.match(/\bfn\s+([a-z0-9_]+)/)
      if (match) annotated.add(match[1])
    }
  }

  const handlerBlock = read(src, 'lib.rs').match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? ''
  const handler = new Set(
    handlerBlock
      .split(',')
      .map((entry) => entry.trim().split('::').pop())
      .filter(Boolean),
  )

  const buildBlock =
    read(dir, 'build.rs').match(/const COMMANDS[^=]*=\s*&\[([\s\S]*?)\n\]/)?.[1] ?? ''
  const build = new Set([...buildBlock.matchAll(/"(animori_[a-z0-9_]+)"/g)].map((m) => m[1]))

  const capability = JSON.parse(read(dir, 'capabilities', 'default.json'))
  const permissions = new Set(
    capability.permissions
      .filter((entry) => typeof entry === 'string' && entry.startsWith('allow-animori-'))
      .map(nameOf),
  )

  return { аннотации: annotated, generate_handler: handler, 'build.rs': build, permissions }
}

function checkCommands(app) {
  const sources = commandSets(app)
  const union = new Set(Object.values(sources).flatMap((set) => [...set]))
  for (const name of [...union].sort()) {
    const missing = Object.entries(sources)
      .filter(([, set]) => !set.has(name))
      .map(([label]) => label)
    if (missing.length) push(`${app}: ${name} — нет в: ${missing.join(', ')}`)
  }
  return union.size
}

/** resolve.alias из настоящего конфига: выполняем ровно то, что выполняет сборка. */
async function viteAliases(app, config) {
  const dir = join(root, 'apps', app)
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    join(dir, config),
    dir,
  )
  const raw = loaded?.config?.resolve?.alias ?? {}
  const map = new Map()
  if (Array.isArray(raw))
    for (const entry of raw) map.set(String(entry.find), String(entry.replacement))
  else for (const [key, value] of Object.entries(raw)) map.set(key, String(value))
  return map
}

function tsPaths(app, config) {
  const dir = join(root, 'apps', app)
  const paths = JSON.parse(jsonc(read(dir, config))).compilerOptions?.paths ?? {}
  const map = new Map()
  for (const [key, targets] of Object.entries(paths))
    map.set(baseKey(key), normTarget(dir, targets[0]))
  return map
}

function diffKeys(labelA, keysA, labelB, keysB) {
  for (const key of keysA)
    if (!keysB.has(key)) push(`алиас: ${key} есть в ${labelA}, нет в ${labelB}`)
  for (const key of keysB)
    if (!keysA.has(key)) push(`алиас: ${key} есть в ${labelB}, нет в ${labelA}`)
}

function diffValues(labelA, mapA, labelB, mapB, keys) {
  // Цель vite — файл (.ts), в tsconfig — модуль без расширения: сверяем без него.
  const bare = (value) => normalize(value).replace(/\.(ts|tsx|mts|cts)$/, '')
  for (const key of keys) {
    if (!mapA.has(key) || !mapB.has(key)) continue
    const a = bare(mapA.get(key))
    const b = bare(mapB.get(key))
    if (a !== b) push(`алиас: цель ${key} — ${labelA}: ${a}; ${labelB}: ${b}`)
  }
}

// В vitest мост подменён заглушкой — назначение конфига, не расхождение.
const VITEST_EXCLUDED_KEYS = ['@/bridge', '@bridge-impl']

async function checkAliases(app) {
  const vite = await viteAliases(app, 'vite.config.ts')
  const vitest = await viteAliases(app, 'vitest.config.ts')
  const ts = tsPaths(app, 'tsconfig.json')
  const shared = tsPaths(app, 'tsconfig.shared.json')

  // hls.js — только сборка, типы из node_modules; @core-tests — только тесты.
  const viteKeys = new Set([...vite.keys()].filter((key) => key !== 'hls.js'))
  const tsKeys = new Set([...ts.keys()].filter((key) => key !== '@core-tests'))
  diffKeys('vite', viteKeys, 'tsconfig', tsKeys)
  diffKeys('vitest', new Set(vitest.keys()), 'tsconfig', new Set(ts.keys()))

  for (const key of shared.keys()) {
    if (!ts.has(key)) push(`алиас: ${key} есть в tsconfig.shared, нет в tsconfig`)
    if (key === '@' || key === '@core-tests')
      push(`алиас: ${key} в tsconfig.shared недопустим — граница ядра`)
  }

  diffValues('vite', vite, 'tsconfig', ts, viteKeys)
  diffValues('tsconfig.shared', shared, 'tsconfig', ts, shared.keys())
  const vitestValueKeys = [...ts.keys()].filter((key) => !VITEST_EXCLUDED_KEYS.includes(key))
  diffValues('vitest', vitest, 'tsconfig', ts, vitestValueKeys)

  return `${vite.size}/${ts.size}/${shared.size}/${vitest.size}`
}

/** Корневой набор ядра: только ключи, значения там свои. */
async function checkCoreConfig(windowsTsKeys) {
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    join(root, 'vitest.core.config.ts'),
    root,
  )
  const keys = Object.keys(loaded?.config?.resolve?.alias ?? {})
  for (const key of keys) {
    if (!windowsTsKeys.has(key))
      push(`алиас: ${key} есть в vitest.core.config, нет в tsconfig windows`)
  }
  return keys.length
}

/** Состав зависимостей как отсортированный список: порядок ключей не важен. */
function depSet(deps) {
  return Object.entries(deps ?? {})
    .map(([name, range]) => `${name}@${range}`)
    .sort()
    .join(',')
}

/** Замок и манифесты обязаны совпадать: рассинхрон роняет `npm ci` в CI, и чинить
 *  его приходится по логам, а не у себя. Поэтому сверяем и перечень рабочих областей,
 *  и содержимое каждой области. */
function checkLock() {
  const lock = JSON.parse(read('package-lock.json'))
  const manifest = JSON.parse(read('package.json'))
  const lockWorkspaces = (lock.packages?.['']?.workspaces ?? []).slice().sort()
  const manifestWorkspaces = (manifest.workspaces ?? []).slice().sort()
  if (lockWorkspaces.join(',') !== manifestWorkspaces.join(','))
    push('замок: перечень рабочих областей в package-lock.json разошёлся с package.json')

  for (const app of APPS) {
    const appManifest = JSON.parse(read('apps', app, 'package.json'))
    const entry = lock.packages?.[`apps/${app}`]
    if (!entry) {
      push(`замок: рабочая область ${app} отсутствует в package-lock.json`)
      continue
    }
    for (const field of ['name', 'version']) {
      if (entry[field] !== appManifest[field])
        push(
          `замок: ${app} — ${field} «${entry[field]}» в замке и «${appManifest[field]}» в манифесте`,
        )
    }
    for (const field of ['dependencies', 'devDependencies']) {
      if (depSet(entry[field]) !== depSet(appManifest[field]))
        push(`замок: ${app} — состав ${field} в замке и в манифесте разошёлся`)
    }
  }
  return `${APPS.length} областей`
}

const report = []
for (const app of APPS) report.push(`${app}: команд ${checkCommands(app)}`)
for (const app of APPS)
  report.push(`${app}: алиасы vite/tsconfig/shared/vitest ${await checkAliases(app)}`)
{
  const windowsTsKeys = new Set(tsPaths('windows', 'tsconfig.json').keys())
  report.push(`корневой vitest.core: ключей ${await checkCoreConfig(windowsTsKeys)}`)
}
report.push(`замок: областей ${checkLock()}`)

if (errors.length) {
  for (const message of errors) console.error(`  ${message}`)
  console.error(`\nРасхождений: ${errors.length}`)
  process.exit(1)
}
console.log(report.join('\n'))
console.log('Синхронно.')
