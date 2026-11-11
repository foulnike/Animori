// Перечень сторонних компонентов, которые реально едут в выпусках, и полные тексты их лицензий.
//
//   node tools/gen-third-party.mjs                         пишет docs/THIRD-PARTY.md
//   node tools/gen-third-party.mjs --check                 сверяет docs/THIRD-PARTY.md с lock-файлами
//   node tools/gen-third-party.mjs --texts <продукт> --out <каталог>
//                                                          пишет THIRD-PARTY-LICENSES.txt и копию
//                                                          THIRD-PARTY.md для вложения в сборку
//
// Источники — package-lock.json (только рантайм интерфейса, без инструментов разработки) и
// `cargo metadata --locked` каждого src-tauri по целевым платформам выпуска (только обычные
// зависимости: build- и dev-зависимости в бинарник не попадают). Лицензии сверяются со списком
// [licenses].allow из deny.toml: пакет, который можно взять только под лицензией вне списка
// (GPL, AGPL, LGPL и прочие), валит любой режим — для него нужно отдельное решение.
//
// Пишем файлом: в выводе консоли Windows кириллица искажается.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = join(ROOT, 'docs', 'THIRD-PARTY.md')
const TEXTS_NAME = 'THIRD-PARTY-LICENSES.txt'

/** Продукты и их выпуски. MSI, NSIS и портабл несут один и тот же AniMori.exe, поэтому
 *  набор у них один; APK arm64 и armv7 собираются из одного дерева — набор один на обе
 *  разрядности, а пакеты лишь одной из них помечаются. */
const ANDROID_TARGETS = [
  { triple: 'aarch64-linux-android', abi: 'arm64' },
  { triple: 'armv7-linux-androideabi', abi: 'armv7' },
]
const PRODUCTS = [
  {
    id: 'windows',
    title: 'Windows',
    artifacts: 'MSI, NSIS, портабл',
    where: 'в каталоге установки и в портабл-архиве',
    targets: [{ triple: 'x86_64-pc-windows-msvc', abi: 'x64' }],
  },
  {
    id: 'android',
    title: 'Телефон',
    artifacts: 'APK arm64, APK armv7',
    where: 'внутри APK (assets) и на странице выпуска',
    targets: ANDROID_TARGETS,
  },
  {
    id: 'android-tv',
    title: 'Android TV',
    artifacts: 'APK arm64, APK armv7',
    where: 'внутри APK (assets) и на странице выпуска',
    targets: ANDROID_TARGETS,
  },
]

// ---------------------------------------------------------------- политика лицензий

/** Список [licenses].allow из deny.toml — один на Rust и npm. */
function readAllowList() {
  const toml = readFileSync(join(ROOT, 'deny.toml'), 'utf8')
  const section = toml.split(/^\[licenses\]\s*$/m)[1] ?? ''
  const block = section.match(/^allow\s*=\s*\[([\s\S]*?)\]/m)
  if (!block) throw new Error('В deny.toml нет [licenses].allow')
  return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]))
}

const COPYLEFT = /^(A?GPL|LGPL)/i

/** Разбор SPDX-выражения в дерево. Старый cargo-формат «MIT/Apache-2.0» — то же, что OR. */
function parseSpdx(expr) {
  const tokens = expr
    .replace(/\//g, ' OR ')
    .replace(/([()])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean)
  let i = 0
  const peek = () => tokens[i]
  const take = () => tokens[i++]
  function or() {
    const parts = [and()]
    while (peek() === 'OR') {
      take()
      parts.push(and())
    }
    return parts.length === 1 ? parts[0] : { op: 'OR', parts }
  }
  function and() {
    const parts = [atom()]
    while (peek() === 'AND') {
      take()
      parts.push(atom())
    }
    return parts.length === 1 ? parts[0] : { op: 'AND', parts }
  }
  function atom() {
    const t = take()
    if (t === '(') {
      const inner = or()
      if (take() !== ')') throw new Error(`Скобка не закрыта: ${expr}`)
      return inner
    }
    if (!t || t === ')' || t === 'OR' || t === 'AND') throw new Error(`Не разобрать: ${expr}`)
    if (peek() === 'WITH') {
      take()
      return { id: t, exception: take() }
    }
    return { id: t }
  }
  const tree = or()
  if (i !== tokens.length) throw new Error(`Лишнее в выражении: ${expr}`)
  return tree
}

/** Набор лицензий, под которыми пакет берём, или null, если выражение не выполнимо списком.
 *  Из OR выбираем ветку по порядку предпочтения: Apache-2.0 не требует строки с
 *  правообладателем, поэтому его текст надёжнее всего восстановить. */
const PREFERENCE = ['Apache-2.0', 'MIT', 'BSD-3-Clause', 'ISC', 'MPL-2.0']
function choose(tree, allow) {
  if (tree.id) {
    const full = tree.exception ? `${tree.id} WITH ${tree.exception}` : tree.id
    return allow.has(full) || allow.has(tree.id) ? [full] : null
  }
  if (tree.op === 'AND') {
    const all = tree.parts.map((p) => choose(p, allow))
    return all.every(Boolean) ? all.flat() : null
  }
  const options = tree.parts.map((p) => choose(p, allow)).filter(Boolean)
  if (!options.length) return null
  const rank = (ids) => Math.min(...ids.map((id) => PREFERENCE.indexOf(id) + 1 || 99))
  return options.sort((a, b) => rank(a) - rank(b))[0]
}

function idsOf(tree) {
  return tree.id ? [tree.id] : tree.parts.flatMap(idsOf)
}

// ---------------------------------------------------------------- npm: рантайм интерфейса

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i

function licenseFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => LICENSE_FILE.test(name) && statSync(join(dir, name)).isFile())
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }))
}

/** Замыкание обычных зависимостей рабочей области по package-lock.json. Peer-зависимости
 *  не идут: их ставит потребитель (у vue это typescript), в сборку они не попадают. Набор —
 *  верхняя граница: часть пакетов vue (компилятор шаблонов) бандлер выбрасывает. */
function npmRuntime(lock, appDir) {
  const packages = lock.packages
  function resolveDep(fromKey, name) {
    let base = fromKey
    for (;;) {
      const key = base ? `${base}/node_modules/${name}` : `node_modules/${name}`
      if (packages[key]) return key
      if (!base) return null
      // Подъём на уровень: из a/node_modules/b в a, из верхнего уровня — в корень.
      const cut = base.lastIndexOf('/node_modules/')
      base = cut >= 0 ? base.slice(0, cut) : ''
    }
  }
  const seen = new Set()
  const stack = [appDir]
  while (stack.length) {
    const key = stack.pop()
    if (seen.has(key)) continue
    seen.add(key)
    const entry = packages[key]
    const deps = { ...(entry.dependencies ?? {}), ...(entry.optionalDependencies ?? {}) }
    for (const name of Object.keys(deps)) {
      const found = resolveDep(key, name)
      if (found) stack.push(found)
      else if (!(entry.optionalDependencies ?? {})[name]) {
        throw new Error(`package-lock.json: ${key} требует ${name}, а его нет`)
      }
    }
  }
  seen.delete(appDir)
  return [...seen].map((key) => {
    const entry = packages[key]
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
    const dir = join(ROOT, key)
    let license = entry.license
    let authors = []
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      license ??= typeof pkg.license === 'string' ? pkg.license : undefined
      const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name
      if (author) authors = [author]
    }
    return { eco: 'npm', name, version: entry.version, license, dir, authors }
  })
}

// ---------------------------------------------------------------- Rust: нативная часть

/** Обычные зависимости crate приложения под одну целевую тройку. */
function cargoRuntime(app, triple) {
  const cwd = join(ROOT, 'apps', app, 'src-tauri')
  const out = execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--locked', '--filter-platform', triple],
    { cwd, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const meta = JSON.parse(out)
  const byId = new Map(meta.packages.map((p) => [p.id, p]))
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]))
  const root = meta.resolve.root
  const seen = new Set()
  const stack = [root]
  while (stack.length) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    for (const dep of nodes.get(id).deps) {
      if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg)
    }
  }
  seen.delete(root)
  return [...seen].map((id) => {
    const p = byId.get(id)
    if (!p.source) throw new Error(`${app}: локальная зависимость ${p.name} не из реестра`)
    return {
      eco: 'cargo',
      name: p.name,
      version: p.version,
      license: p.license ?? undefined,
      licenseFile: p.license_file ? resolve(dirname(p.manifest_path), p.license_file) : undefined,
      dir: dirname(p.manifest_path),
      authors: (p.authors ?? []).map((a) => a.replace(/\s*<[^>]*>/, '')),
    }
  })
}

// ---------------------------------------------------------------- сборка наборов

const keyOf = (p) => `${p.eco}:${p.name}@${p.version}`

function collect() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))
  const allow = readAllowList()
  const problems = []
  const cargoCache = new Map()

  const products = PRODUCTS.map((product) => {
    const npm = npmRuntime(lock, `apps/${product.id}`)
    const rust = new Map()
    for (const target of product.targets) {
      const cacheKey = `${product.id}|${target.triple}`
      if (!cargoCache.has(cacheKey))
        cargoCache.set(cacheKey, cargoRuntime(product.id, target.triple))
      for (const p of cargoCache.get(cacheKey)) {
        const k = keyOf(p)
        const known = rust.get(k) ?? { ...p, abis: [] }
        known.abis.push(target.abi)
        rust.set(k, known)
      }
    }
    for (const p of rust.values()) {
      p.only = p.abis.length < product.targets.length ? p.abis : undefined
      delete p.abis
    }
    return { ...product, npm, rust: [...rust.values()] }
  })

  for (const product of products) {
    for (const p of [...product.npm, ...product.rust]) {
      if (!p.license) {
        problems.push(`${product.id}: ${p.name}@${p.version} — лицензия не указана`)
        continue
      }
      let tree
      try {
        tree = parseSpdx(p.license)
      } catch (e) {
        problems.push(`${product.id}: ${p.name}@${p.version} — ${e.message}`)
        continue
      }
      p.chosen = choose(tree, allow)
      if (!p.chosen) {
        const copyleft = idsOf(tree).some((id) => COPYLEFT.test(id))
        problems.push(
          `${product.id}: ${p.name}@${p.version} (${p.license}) — ` +
            (copyleft
              ? 'copyleft-лицензия без отдельного решения'
              : 'лицензия вне [licenses].allow в deny.toml'),
        )
      }
    }
  }
  return { products, problems }
}

const sortPkgs = (list) =>
  [...list].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  )

// ---------------------------------------------------------------- THIRD-PARTY.md

function table(list) {
  const byLicense = new Map()
  for (const p of sortPkgs(list)) {
    const group = byLicense.get(p.license) ?? []
    group.push(p)
    byLicense.set(p.license, group)
  }
  return [...byLicense.keys()]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((license) => {
      const rows = byLicense
        .get(license)
        .map((p) => `| ${p.name} | ${p.version}${p.only ? ` | только ${p.only.join(', ')}` : ' |'}`)
      return `#### ${license} (${rows.length})\n\n| Пакет | Версия | |\n| --- | --- | --- |\n${rows.join('\n')}\n`
    })
    .join('\n')
}

/** Продукты с одинаковым набором сворачиваются в один раздел: у телефона и приставки
 *  Rust-дерево совпадает побайтово, а интерфейс у всех трёх один. */
function sections(products, field, heading) {
  const groups = new Map()
  for (const product of products) {
    const sig = sortPkgs(product[field])
      .map((p) => `${keyOf(p)}|${p.license}|${p.only ?? ''}`)
      .join('\n')
    const group = groups.get(sig) ?? { titles: [], list: product[field] }
    group.titles.push(product.title)
    groups.set(sig, group)
  }
  return [...groups.values()]
    .map((g) => `### ${heading}: ${g.titles.join(', ')} — ${g.list.length}\n\n${table(g.list)}`)
    .join('\n')
}

function renderDoc({ products }) {
  const allow = [...readAllowList()].sort()
  const devCount = Object.entries(
    JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')).packages,
  ).filter(([k, v]) => k.includes('node_modules/') && (v.dev || v.devOptional)).length

  const summary = products
    .map((p) => `| ${p.title} | ${p.artifacts} | ${p.npm.length} | ${p.rust.length} | ${p.where} |`)
    .join('\n')

  const mpl = new Map()
  for (const product of products) {
    for (const p of [...product.npm, ...product.rust]) {
      if (!/MPL/.test(p.license ?? '')) continue
      const k = keyOf(p)
      const row = mpl.get(k) ?? { ...p, in: [] }
      row.in.push(product.title)
      mpl.set(k, row)
    }
  }
  const mplRows = sortPkgs([...mpl.values()])
    .map((p) => {
      const src =
        p.eco === 'cargo'
          ? `https://crates.io/crates/${p.name}/${p.version}`
          : `https://www.npmjs.com/package/${p.name}/v/${p.version}`
      return `| ${p.name} | ${p.version} | ${p.license} | ${p.in.join(', ')} | ${src} |`
    })
    .join('\n')

  return `# Сторонние компоненты

<!-- Файл генерируется: npm run third-party. CI сверяет его с lock-файлами
     (npm run third-party -- --check), правки руками не переживут следующий прогон. -->

Здесь перечислены сторонние пакеты, которые входят в выпуски AniMori, с их лицензиями.
Источник — \`package-lock.json\` и \`Cargo.lock\` каждого приложения.

Сам код AniMori распространяется под лицензией MIT — см. [LICENSE](../LICENSE). Зависимости
распространяются на условиях своих лицензий.

## Что входит в выпуски

| Продукт | Файлы выпуска | Интерфейс (npm) | Нативная часть (Rust) | Полные тексты лицензий |
| --- | --- | --- | --- | --- |
${summary}

MSI, NSIS и портабл содержат один и тот же \`AniMori.exe\`, поэтому набор у них один. APK arm64 и
armv7 собираются из одного дерева; пакеты, которые входят лишь в одну разрядность, помечены.
Полные тексты лежат в файле \`${TEXTS_NAME}\` рядом с программой.

Интерфейсный набор — верхняя граница: в него входят все рантайм-зависимости пакетов, а часть
из них (компилятор шаблонов Vue) бандлер в сборку не берёт. Инструменты разработки — сборщик,
тесты, линтер, ${devCount} пакетов npm — в выпуски не входят и здесь не перечислены.

## Политика лицензий

Допускаются только лицензии из \`[licenses].allow\` в \`deny.toml\`:
${allow.map((a) => `\`${a}\``).join(', ')}.
Пакет, который можно взять лишь под другой лицензией, в том числе GPL, AGPL или LGPL, валит
генератор и CI. Такой пакет добавляется только после отдельного решения о лицензии.

## MPL-2.0

MPL-2.0 — copyleft на уровне файла: изменённые файлы такого пакета должны оставаться доступными
под MPL-2.0, остальной код под это условие не попадает. Мы эти пакеты не изменяем, исходники
доступны по ссылкам ниже. Текст MPL-2.0 входит в \`${TEXTS_NAME}\`.

| Пакет | Версия | Лицензия | Продукты | Исходники |
| --- | --- | --- | --- | --- |
${mplRows || '| — | | | | |'}

## Состав

${sections(products, 'npm', 'Интерфейс')}
${sections(products, 'rust', 'Нативная часть')}`
}

// ---------------------------------------------------------------- THIRD-PARTY-LICENSES.txt

const MIT_TEMPLATE = (holders) => `MIT License

Copyright (c) ${holders}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const BSD3_TEMPLATE = (holders) => `Copyright (c) ${holders}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`

/** Лицензия, которую текст из файла пакета узнаваемо несёт. Нужна, чтобы взять дословный
 *  текст Apache-2.0 или MPL-2.0 для пакета, который файл лицензии не приложил: в этих
 *  текстах нет строки с правообладателем, и чужая копия дословно та же. */
function detect(text) {
  if (/Apache License\s+Version 2\.0, January 2004/.test(text)) return 'Apache-2.0'
  if (/Mozilla Public License,?\s+Version 2\.0/i.test(text)) return 'MPL-2.0'
  if (/^\s*Boost Software License - Version 1\.0/.test(text)) return 'BSL-1.0'
  return null
}

/** Тексты лицензий: файлы из пакета, а если пакет их не приложил — стандартный текст
 *  выбранной лицензии (для MIT и BSD с авторами из манифеста). Текст без правообладателя
 *  (Apache-2.0, MPL-2.0, BSL-1.0) берётся дословно из другого пакета того же набора. */
function texts(packages) {
  const canonical = new Map()
  for (const p of packages) {
    for (const f of licenseFiles(p.dir)) {
      const id = detect(f.text)
      if (id && !canonical.has(id)) canonical.set(id, f.text)
    }
  }
  const problems = []
  const blocks = new Map()
  const add = (text, label) => {
    const norm = text.replace(/\r\n/g, '\n').trim()
    const key = norm.replace(/\s+/g, ' ')
    const block = blocks.get(key) ?? { text: norm, labels: new Set() }
    block.labels.add(label)
    blocks.set(key, block)
  }
  for (const p of sortPkgs(packages)) {
    const label = `${p.name} ${p.version} (${p.license})`
    let files = licenseFiles(p.dir)
    if (p.licenseFile && existsSync(p.licenseFile)) {
      files = [{ name: 'license_file', text: readFileSync(p.licenseFile, 'utf8') }, ...files]
    }
    if (files.length) {
      for (const f of files) add(f.text, label)
      continue
    }
    const holders = p.authors.length ? p.authors.join(', ') : `авторы ${p.name}`
    for (const id of p.chosen ?? []) {
      const base = id.split(' WITH ')[0]
      const text =
        base === 'MIT'
          ? MIT_TEMPLATE(holders)
          : base === 'BSD-3-Clause'
            ? BSD3_TEMPLATE(holders)
            : canonical.get(base)
      if (!text) {
        problems.push(`${label}: нет файла лицензии и нечем восстановить текст ${base}`)
        continue
      }
      add(text, `${label} — файл лицензии в пакете отсутствует, приведён стандартный текст ${base}`)
    }
  }
  const body = [...blocks.values()]
    .map((b) => ({ ...b, labels: [...b.labels].sort((x, y) => x.localeCompare(y, 'en')) }))
    .sort((a, b) => a.labels[0].localeCompare(b.labels[0], 'en'))
    .map((b) => `${'='.repeat(78)}\n${b.labels.join('\n')}\n${'-'.repeat(78)}\n\n${b.text}\n`)
    .join('\n')
  return { body, problems, count: blocks.size }
}

// ---------------------------------------------------------------- запуск

function fail(lines) {
  for (const line of lines) console.error(`  ${line}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const { products, problems } = collect()
if (problems.length) {
  console.error('Лицензии не прошли политику:')
  fail(problems)
}

if (args.includes('--texts')) {
  const id = args[args.indexOf('--texts') + 1]
  const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined
  const product = products.find((p) => p.id === id)
  if (!product || !outArg) {
    console.error(`Использование: --texts <${PRODUCTS.map((p) => p.id).join('|')}> --out <каталог>`)
    process.exit(2)
  }
  const out = resolve(outArg)
  const result = texts([...product.npm, ...product.rust])
  if (result.problems.length) {
    console.error('Не все тексты лицензий найдены:')
    fail(result.problems)
  }
  const head =
    `Тексты лицензий сторонних компонентов AniMori — ${product.title} (${product.artifacts}).\n` +
    `Перечень с версиями — THIRD-PARTY.md рядом с этим файлом.\n` +
    `Пакеты с одинаковым текстом лицензии собраны в один блок.\n\n`
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, TEXTS_NAME), head + result.body, 'utf8')
  writeFileSync(join(out, 'THIRD-PARTY.md'), readFileSync(DOC, 'utf8'), 'utf8')
  console.log(
    `${join(out, TEXTS_NAME)}: ${product.npm.length + product.rust.length} пакетов, ${result.count} текстов`,
  )
} else if (args.includes('--check')) {
  const want = renderDoc({ products }).replace(/\r\n/g, '\n')
  const have = existsSync(DOC) ? readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n') : ''
  const missing = products.flatMap((p) => texts([...p.npm, ...p.rust]).problems)
  if (missing.length) {
    console.error('Не все тексты лицензий найдены:')
    fail(missing)
  }
  if (want !== have) {
    console.error('docs/THIRD-PARTY.md не совпадает с lock-файлами. Обновить: npm run third-party')
    process.exit(1)
  }
  console.log('docs/THIRD-PARTY.md совпадает с lock-файлами, лицензии в политике, тексты найдены.')
} else {
  writeFileSync(DOC, renderDoc({ products }), 'utf8')
  const total = new Set(products.flatMap((p) => [...p.npm, ...p.rust].map(keyOf))).size
  console.log(`docs/THIRD-PARTY.md готов: ${total} пакетов в выпусках`)
}
