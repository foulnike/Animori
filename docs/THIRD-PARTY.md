# Сторонние компоненты

Этот файл перечисляет зависимости, которые приходят вместе с программой, с их лицензиями.
Сгенерирован из `package-lock.json`; список и файл обновляются одним шагом, поэтому
расхождение между ними невозможно.

Сам код AniMori распространяется под лицензией MIT — см. [LICENSE](../LICENSE). Зависимости
распространяются на условиях своих лицензий, а не MIT.

## Что важно знать про copyleft

Одна лицензия в списке требует внимания:

- **MPL-2.0** (Mozilla Public License) — copyleft на уровне файла. Изменённый файл MPL
  обязан оставаться доступным под MPL-2.0, остальной проект под это не выпадает. Мы эти
  файлы не меняли, поэтому публиковать их исходники не требуется.

Остальные лицензии — MIT, ISC, Apache-2.0, BSD — не накладывают обязанностей на код
AniMori.

Полные тексты лицензий лежат в самих пакетах в `node_modules`, а при сборке Windows
копируются в архив вместе с программой — см. `.github/workflows/release.yml`.

## Состав

Всего пакетов с указанной лицензией: **242**.

### Apache-2.0 (18)

| Пакет | Версия |
| --- | --- |
| @eslint/config-array | 0.23.5 |
| @eslint/config-helpers | 0.7.0 |
| @eslint/core | 1.2.1 |
| @eslint/object-schema | 3.0.5 |
| @eslint/plugin-kit | 0.7.3 |
| @humanfs/core | 0.19.2 |
| @humanfs/node | 0.16.8 |
| @humanfs/types | 0.15.0 |
| @humanwhocodes/module-importer | 1.0.1 |
| @humanwhocodes/retry | 0.4.3 |
| aria-query | 5.3.2 |
| detect-libc | 2.1.2 |
| eslint-visitor-keys | 3.4.3 |
| eslint-visitor-keys | 5.0.1 |
| expect-type | 1.4.0 |
| hls.js | 1.7.3 |
| typescript | 5.9.3 |
| xml-name-validator | 5.0.0 |

### Apache-2.0 OR MIT (13)

| Пакет | Версия |
| --- | --- |
| @tauri-apps/api | 2.12.1 |
| @tauri-apps/cli | 2.12.1 |
| @tauri-apps/cli-darwin-arm64 | 2.12.1 |
| @tauri-apps/cli-darwin-x64 | 2.12.1 |
| @tauri-apps/cli-linux-arm-gnueabihf | 2.12.1 |
| @tauri-apps/cli-linux-arm64-gnu | 2.12.1 |
| @tauri-apps/cli-linux-arm64-musl | 2.12.1 |
| @tauri-apps/cli-linux-riscv64-gnu | 2.12.1 |
| @tauri-apps/cli-linux-x64-gnu | 2.12.1 |
| @tauri-apps/cli-linux-x64-musl | 2.12.1 |
| @tauri-apps/cli-win32-arm64-msvc | 2.12.1 |
| @tauri-apps/cli-win32-ia32-msvc | 2.12.1 |
| @tauri-apps/cli-win32-x64-msvc | 2.12.1 |

### BSD-2-Clause (8)

| Пакет | Версия |
| --- | --- |
| entities | 7.0.1 |
| eslint-scope | 9.1.2 |
| espree | 11.2.0 |
| esrecurse | 4.3.0 |
| estraverse | 5.3.0 |
| esutils | 2.0.3 |
| nth-check | 2.1.1 |
| uri-js | 4.4.1 |

### BSD-3-Clause (2)

| Пакет | Версия |
| --- | --- |
| esquery | 1.7.0 |
| source-map-js | 1.2.2 |

### BlueOak-1.0.0 (1)

| Пакет | Версия |
| --- | --- |
| minimatch | 10.2.6 |

### ISC (9)

| Пакет | Версия |
| --- | --- |
| boolbase | 1.0.0 |
| flatted | 3.4.4 |
| glob-parent | 6.0.2 |
| isexe | 2.0.0 |
| minimatch | 9.0.9 |
| picocolors | 1.1.1 |
| semver | 7.8.5 |
| siginfo | 2.0.0 |
| which | 2.0.2 |

### MIT (176)

| Пакет | Версия |
| --- | --- |
| @babel/helper-string-parser | 7.29.7 |
| @babel/helper-validator-identifier | 7.29.7 |
| @babel/parser | 7.29.9 |
| @babel/types | 7.29.8 |
| @cacheable/memory | 2.2.0 |
| @cacheable/utils | 2.5.0 |
| @eslint-community/eslint-utils | 4.10.1 |
| @eslint-community/regexpp | 4.12.2 |
| @eslint/js | 10.0.1 |
| @jridgewell/sourcemap-codec | 1.6.0 |
| @keyv/bigmap | 1.3.1 |
| @keyv/serialize | 1.1.1 |
| @oxc-project/types | 0.152.0 |
| @rolldown/binding-android-arm-eabi | 1.2.12 |
| @rolldown/binding-android-arm64 | 1.2.12 |
| @rolldown/binding-darwin-arm64 | 1.2.12 |
| @rolldown/binding-darwin-x64 | 1.2.12 |
| @rolldown/binding-freebsd-x64 | 1.2.12 |
| @rolldown/binding-linux-arm-gnueabihf | 1.2.12 |
| @rolldown/binding-linux-arm64-gnu | 1.2.12 |
| @rolldown/binding-linux-arm64-musl | 1.2.12 |
| @rolldown/binding-linux-ppc64-gnu | 1.2.12 |
| @rolldown/binding-linux-s390x-gnu | 1.2.12 |
| @rolldown/binding-linux-x64-gnu | 1.2.12 |
| @rolldown/binding-linux-x64-musl | 1.2.12 |
| @rolldown/binding-openharmony-arm64 | 1.2.12 |
| @rolldown/binding-win32-arm64-msvc | 1.2.12 |
| @rolldown/binding-win32-x64-msvc | 1.2.12 |
| @rolldown/pluginutils | 1.0.1 |
| @standard-schema/spec | 1.1.0 |
| @types/chai | 5.2.3 |
| @types/deep-eql | 4.0.2 |
| @types/esrecurse | 4.3.1 |
| @types/estree | 1.0.9 |
| @types/json-schema | 7.0.15 |
| @types/node | 24.19.1 |
| @types/node | 24.19.2 |
| @types/node | 26.6.4 |
| @types/whatwg-mimetype | 3.0.2 |
| @types/ws | 8.18.2 |
| @typescript-eslint/eslint-plugin | 8.71.1 |
| @typescript-eslint/parser | 8.71.1 |
| @typescript-eslint/project-service | 8.71.1 |
| @typescript-eslint/scope-manager | 8.71.1 |
| @typescript-eslint/tsconfig-utils | 8.71.1 |
| @typescript-eslint/type-utils | 8.71.1 |
| @typescript-eslint/types | 8.71.1 |
| @typescript-eslint/typescript-estree | 8.71.1 |
| @typescript-eslint/utils | 8.71.1 |
| @typescript-eslint/visitor-keys | 8.71.1 |
| @vitejs/plugin-vue | 6.0.9 |
| @vitest/expect | 4.1.11 |
| @vitest/mocker | 4.1.11 |
| @vitest/pretty-format | 4.1.11 |
| @vitest/runner | 4.1.11 |
| @vitest/snapshot | 4.1.11 |
| @vitest/spy | 4.1.11 |
| @vitest/utils | 4.1.11 |
| @volar/language-core | 2.4.15 |
| @volar/source-map | 2.4.15 |
| @volar/typescript | 2.4.15 |
| @vue/compiler-core | 3.5.43 |
| @vue/compiler-dom | 3.5.43 |
| @vue/compiler-sfc | 3.5.43 |
| @vue/compiler-ssr | 3.5.43 |
| @vue/compiler-vue2 | 2.7.16 |
| @vue/language-core | 2.2.12 |
| @vue/reactivity | 3.5.43 |
| @vue/runtime-core | 3.5.43 |
| @vue/runtime-dom | 3.5.43 |
| @vue/server-renderer | 3.5.43 |
| @vue/shared | 3.5.43 |
| acorn | 8.19.0 |
| acorn-jsx | 5.3.2 |
| ajv | 6.15.0 |
| alien-signals | 1.0.13 |
| assertion-error | 2.0.1 |
| balanced-match | 1.0.2 |
| balanced-match | 4.0.4 |
| brace-expansion | 2.1.7 |
| brace-expansion | 5.0.12 |
| buffer-image-size | 0.6.4 |
| cacheable | 2.5.0 |
| chai | 6.3.0 |
| chalk | 5.6.2 |
| convert-source-map | 2.0.0 |
| cross-spawn | 7.0.6 |
| cssesc | 3.0.0 |
| csstype | 3.2.3 |
| de-indent | 1.0.2 |
| debug | 4.4.3 |
| deep-is | 0.1.4 |
| dom-accessibility-api | 0.5.16 |
| es-module-lexer | 2.3.2 |
| escape-string-regexp | 4.0.0 |
| eslint | 10.12.0 |
| eslint-config-prettier | 10.1.8 |
| eslint-plugin-vue | 10.11.1 |
| estree-walker | 2.0.2 |
| estree-walker | 3.0.3 |
| fast-deep-equal | 3.1.3 |
| fast-json-stable-stringify | 2.1.0 |
| fast-levenshtein | 2.0.6 |
| fdir | 6.5.0 |
| file-entry-cache | 11.1.5 |
| find-up | 5.0.0 |
| flat-cache | 6.1.23 |
| fsevents | 2.3.3 |
| globals | 17.13.0 |
| happy-dom | 20.14.5 |
| hashery | 1.5.1 |
| he | 1.2.0 |
| hookified | 1.15.1 |
| hookified | 2.2.0 |
| ignore | 5.3.2 |
| ignore | 7.0.12 |
| imurmurhash | 0.1.4 |
| indent-string | 4.0.0 |
| is-extglob | 2.1.1 |
| is-glob | 4.0.3 |
| json-schema-traverse | 0.4.1 |
| json-stable-stringify-without-jsonify | 1.0.1 |
| keyv | 5.6.0 |
| levn | 0.4.1 |
| locate-path | 6.0.0 |
| lodash-es | 4.18.1 |
| magic-string | 0.30.21 |
| min-indent | 1.0.1 |
| ms | 2.1.3 |
| muggle-string | 0.4.1 |
| nanoid | 3.3.19 |
| natural-compare | 1.4.0 |
| obug | 2.2.1 |
| optionator | 0.9.4 |
| p-limit | 3.1.0 |
| p-locate | 5.0.0 |
| path-browserify | 1.0.1 |
| path-exists | 4.0.0 |
| path-key | 3.1.1 |
| pathe | 2.0.3 |
| picomatch | 4.0.7 |
| postcss | 8.5.28 |
| postcss-selector-parser | 7.1.6 |
| prelude-ls | 1.2.1 |
| prettier | 3.9.9 |
| punycode | 2.3.1 |
| qified | 0.10.1 |
| redent | 3.0.0 |
| rolldown | 1.2.12 |
| shebang-command | 2.0.0 |
| shebang-regex | 3.0.0 |
| stackback | 0.0.2 |
| std-env | 4.3.0 |
| strip-indent | 3.0.0 |
| tinybench | 2.9.0 |
| tinyexec | 1.3.1 |
| tinyglobby | 0.2.17 |
| tinyrainbow | 3.2.0 |
| ts-api-utils | 2.5.0 |
| type-check | 0.4.0 |
| typescript-eslint | 8.71.1 |
| undici-types | 7.24.6 |
| undici-types | 8.9.0 |
| util-deprecate | 1.0.2 |
| vite | 8.3.2 |
| vitest | 4.1.11 |
| vitest-axe | 0.1.0 |
| vscode-uri | 3.2.0 |
| vue | 3.5.43 |
| vue-eslint-parser | 10.4.1 |
| vue-tsc | 2.2.12 |
| whatwg-mimetype | 3.0.0 |
| why-is-node-running | 2.3.0 |
| word-wrap | 1.2.5 |
| ws | 8.22.0 |
| yocto-queue | 0.1.0 |

### MIT OR Apache-2.0 (2)

| Пакет | Версия |
| --- | --- |
| @tauri-apps/plugin-clipboard-manager | 2.4.1 |
| @tauri-apps/plugin-http | 2.8.0 |

### MPL-2.0 (13)

| Пакет | Версия |
| --- | --- |
| axe-core | 4.14.0 |
| lightningcss | 1.33.0 |
| lightningcss-android-arm64 | 1.33.0 |
| lightningcss-darwin-arm64 | 1.33.0 |
| lightningcss-darwin-x64 | 1.33.0 |
| lightningcss-freebsd-x64 | 1.33.0 |
| lightningcss-linux-arm-gnueabihf | 1.33.0 |
| lightningcss-linux-arm64-gnu | 1.33.0 |
| lightningcss-linux-arm64-musl | 1.33.0 |
| lightningcss-linux-x64-gnu | 1.33.0 |
| lightningcss-linux-x64-musl | 1.33.0 |
| lightningcss-win32-arm64-msvc | 1.33.0 |
| lightningcss-win32-x64-msvc | 1.33.0 |
