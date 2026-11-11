# Сторонние компоненты

<!-- Файл генерируется: npm run third-party. CI сверяет его с lock-файлами
     (npm run third-party -- --check), правки руками не переживут следующий прогон. -->

Здесь перечислены сторонние пакеты, которые входят в выпуски AniMori, с их лицензиями.
Источник — `package-lock.json` и `Cargo.lock` каждого приложения.

Сам код AniMori распространяется под лицензией MIT — см. [LICENSE](../LICENSE). Зависимости
распространяются на условиях своих лицензий.

## Что входит в выпуски

| Продукт | Файлы выпуска | Интерфейс (npm) | Нативная часть (Rust) | Полные тексты лицензий |
| --- | --- | --- | --- | --- |
| Windows | MSI, NSIS, портабл | 26 | 316 | в каталоге установки и в портабл-архиве |
| Телефон | APK arm64, APK armv7 | 26 | 300 | внутри APK (assets) и на странице выпуска |
| Android TV | APK arm64, APK armv7 | 26 | 300 | внутри APK (assets) и на странице выпуска |

MSI, NSIS и портабл содержат один и тот же `AniMori.exe`, поэтому набор у них один. APK arm64 и
armv7 собираются из одного дерева; пакеты, которые входят лишь в одну разрядность, помечены.
Полные тексты лежат в файле `THIRD-PARTY-LICENSES.txt` рядом с программой.

Интерфейсный набор — верхняя граница: в него входят все рантайм-зависимости пакетов, а часть
из них (компилятор шаблонов Vue) бандлер в сборку не берёт. Инструменты разработки — сборщик,
тесты, линтер, 218 пакетов npm — в выпуски не входят и здесь не перечислены.

## Политика лицензий

Допускаются только лицензии из `[licenses].allow` в `deny.toml`:
`0BSD`, `Apache-2.0`, `Apache-2.0 WITH LLVM-exception`, `BSD-2-Clause`, `BSD-3-Clause`, `BSL-1.0`, `CC0-1.0`, `CDLA-Permissive-2.0`, `ISC`, `MIT`, `MPL-2.0`, `Unicode-3.0`, `Unlicense`, `Zlib`.
Пакет, который можно взять лишь под другой лицензией, в том числе GPL, AGPL или LGPL, валит
генератор и CI. Такой пакет добавляется только после отдельного решения о лицензии.

## MPL-2.0

MPL-2.0 — copyleft на уровне файла: изменённые файлы такого пакета должны оставаться доступными
под MPL-2.0, остальной код под это условие не попадает. Мы эти пакеты не изменяем, исходники
доступны по ссылкам ниже. Текст MPL-2.0 входит в `THIRD-PARTY-LICENSES.txt`.

| Пакет | Версия | Лицензия | Продукты | Исходники |
| --- | --- | --- | --- | --- |
| cssparser | 0.37.0 | MPL-2.0 | Windows, Телефон, Android TV | https://crates.io/crates/cssparser/0.37.0 |
| cssparser | 0.38.0 | MPL-2.0 | Телефон, Android TV | https://crates.io/crates/cssparser/0.38.0 |
| cssparser-macros | 0.7.1 | MPL-2.0 | Windows, Телефон, Android TV | https://crates.io/crates/cssparser-macros/0.7.1 |
| dtoa-short | 0.3.5 | MPL-2.0 | Windows, Телефон, Android TV | https://crates.io/crates/dtoa-short/0.3.5 |
| option-ext | 0.2.0 | MPL-2.0 | Windows, Телефон, Android TV | https://crates.io/crates/option-ext/0.2.0 |
| selectors | 0.38.0 | MPL-2.0 | Windows, Телефон, Android TV | https://crates.io/crates/selectors/0.38.0 |
| selectors | 0.41.0 | MPL-2.0 | Телефон, Android TV | https://crates.io/crates/selectors/0.41.0 |

## Состав

### Интерфейс: Windows, Телефон, Android TV — 26

#### Apache-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| hls.js | 1.7.3 |

#### Apache-2.0 OR MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| @tauri-apps/api | 2.12.1 |

#### BSD-2-Clause (1)

| Пакет | Версия | |
| --- | --- | --- |
| entities | 7.0.1 |

#### BSD-3-Clause (1)

| Пакет | Версия | |
| --- | --- | --- |
| source-map-js | 1.2.2 |

#### ISC (1)

| Пакет | Версия | |
| --- | --- | --- |
| picocolors | 1.1.1 |

#### MIT (20)

| Пакет | Версия | |
| --- | --- | --- |
| @babel/helper-string-parser | 7.29.7 |
| @babel/helper-validator-identifier | 7.29.7 |
| @babel/parser | 7.29.9 |
| @babel/types | 7.29.8 |
| @jridgewell/sourcemap-codec | 1.6.0 |
| @vue/compiler-core | 3.5.43 |
| @vue/compiler-dom | 3.5.43 |
| @vue/compiler-sfc | 3.5.43 |
| @vue/compiler-ssr | 3.5.43 |
| @vue/reactivity | 3.5.43 |
| @vue/runtime-core | 3.5.43 |
| @vue/runtime-dom | 3.5.43 |
| @vue/server-renderer | 3.5.43 |
| @vue/shared | 3.5.43 |
| csstype | 3.2.3 |
| estree-walker | 2.0.2 |
| magic-string | 0.30.21 |
| nanoid | 3.3.20 |
| postcss | 8.5.32 |
| vue | 3.5.43 |

#### MIT OR Apache-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| @tauri-apps/plugin-clipboard-manager | 2.5.0 |

### Нативная часть: Windows — 316

#### (Apache-2.0 OR MIT) AND BSD-3-Clause (1)

| Пакет | Версия | |
| --- | --- | --- |
| encoding_rs | 0.8.44 |

#### (MIT OR Apache-2.0) AND Unicode-3.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| unicode-ident | 1.0.27 |

#### 0BSD OR MIT OR Apache-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| adler2 | 2.0.1 |

#### Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| sync_wrapper | 1.0.2 |
| tao | 0.37.2 |

#### Apache-2.0 / MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| fnv | 1.0.7 |

#### Apache-2.0 AND ISC (1)

| Пакет | Версия | |
| --- | --- | --- |
| ring | 0.17.14 |

#### Apache-2.0 AND MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| dpi | 0.1.2 |

#### Apache-2.0 OR BSL-1.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| ryu | 1.0.23 |

#### Apache-2.0 OR ISC OR MIT (2)

| Пакет | Версия | |
| --- | --- | --- |
| hyper-rustls | 0.27.10 |
| rustls | 0.23.46 |

#### Apache-2.0 OR MIT (35)

| Пакет | Версия | |
| --- | --- | --- |
| atomic-waker | 1.1.2 |
| bit-set | 0.8.0 |
| bit-vec | 0.8.0 |
| ctor | 1.0.13 |
| equivalent | 1.0.3 |
| fastrand | 2.5.0 |
| idna_adapter | 1.2.2 |
| indexmap | 1.9.3 |
| indexmap | 2.14.2 |
| muda | 0.20.0 |
| multiversion_no_op | 1.0.0 |
| pin-project-lite | 0.2.17 |
| rustc-hash | 2.1.3 |
| tauri | 2.12.5 |
| tauri-codegen | 2.7.4 |
| tauri-macros | 2.7.4 |
| tauri-plugin-clipboard-manager | 2.5.0 |
| tauri-plugin-dialog | 2.8.4 |
| tauri-plugin-fs | 2.7.1 |
| tauri-plugin-http | 2.9.0 |
| tauri-plugin-log | 2.10.2 |
| tauri-plugin-opener | 2.7.3 |
| tauri-plugin-store | 2.5.1 |
| tauri-plugin-updater | 2.14.1 |
| tauri-plugin-window-state | 2.5.0 |
| tauri-runtime | 2.12.2 |
| tauri-runtime-wry | 2.12.3 |
| tauri-utils | 2.10.2 |
| utf_types | 1.0.0 |
| utf8_iter | 1.1.0 |
| uuid | 1.29.2 |
| window-vibrancy | 0.8.1 |
| wry | 0.57.2 |
| zeroize | 1.9.1 |
| zeroize_derive | 1.5.0 |

#### BSD-2-Clause OR Apache-2.0 OR MIT (2)

| Пакет | Версия | |
| --- | --- | --- |
| zerocopy | 0.8.63 |
| zerocopy-derive | 0.8.63 |

#### BSD-3-Clause (3)

| Пакет | Версия | |
| --- | --- | --- |
| alloc-no-stdlib | 3.0.0 |
| alloc-stdlib | 0.3.0 |
| subtle | 2.6.1 |

#### BSD-3-Clause AND MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| brotli | 9.1.1 |

#### BSD-3-Clause OR Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| moxcms | 0.8.1 |
| pxfm | 0.1.30 |

#### BSD-3-Clause/MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| brotli-decompressor | 6.3.1 |

#### BSL-1.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| clipboard-win | 5.4.3 |
| error-code | 3.4.0 |

#### CC0-1.0 OR MIT-0 OR Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| constant_time_eq | 0.6.1 |
| dunce | 1.0.5 |

#### CDLA-Permissive-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| webpki-roots | 1.0.11 |

#### ISC (2)

| Пакет | Версия | |
| --- | --- | --- |
| rustls-webpki | 0.103.16 |
| untrusted | 0.9.0 |

#### MIT (59)

| Пакет | Версия | |
| --- | --- | --- |
| bytes | 1.12.1 |
| cargo_metadata | 0.19.2 |
| cfb | 0.14.0 |
| darling | 0.24.1 |
| darling_core | 0.24.1 |
| darling_macro | 0.24.1 |
| derive_more | 2.1.1 |
| derive_more-impl | 2.1.1 |
| dom_query | 0.28.0 |
| fax | 0.2.7 |
| fern | 0.7.1 |
| generic-array | 0.14.7 |
| h2 | 0.4.20 |
| http-body | 1.1.0 |
| http-body-util | 0.1.5 |
| hyper | 1.12.0 |
| hyper-util | 0.1.21 |
| ico | 0.6.0 |
| infer | 0.22.0 |
| minisign-verify | 0.3.0 |
| mio | 1.2.4 |
| new_debug_unreachable | 1.0.6 |
| open | 5.4.5 |
| phf | 0.13.1 |
| phf_generator | 0.13.1 |
| phf_macros | 0.13.1 |
| phf_shared | 0.13.1 |
| plist | 1.10.3 |
| precomputed-hash | 0.1.1 |
| quick-xml | 0.42.0 |
| rfd | 0.17.2 |
| schemars | 0.8.22 |
| schemars | 0.9.0 |
| schemars | 1.2.3 |
| schemars_derive | 0.8.22 |
| simd-adler32 | 0.3.10 |
| slab | 0.4.12 |
| strsim | 0.11.1 |
| synstructure | 0.14.0 |
| tiff | 0.11.3 |
| tokio | 1.54.1 |
| tokio-macros | 2.7.2 |
| tokio-util | 0.7.20 |
| tower | 0.5.3 |
| tower-http | 0.6.11 |
| tower-layer | 0.3.3 |
| tower-service | 0.3.3 |
| tracing | 0.1.44 |
| tracing-attributes | 0.1.31 |
| tracing-core | 0.1.36 |
| try-lock | 0.2.5 |
| urlpattern | 0.6.0 |
| want | 0.3.2 |
| webview2-com | 0.39.1 |
| webview2-com-macros | 0.8.1 |
| webview2-com-sys | 0.39.1 |
| winnow | 1.0.5 |
| zip | 9.5.0 |
| zmij | 1.0.23 |

#### MIT OR Apache-2.0 (145)

| Пакет | Версия | |
| --- | --- | --- |
| anyhow | 1.0.104 |
| arboard | 3.7.0 |
| base64 | 0.22.1 |
| base64 | 0.23.1 |
| bitflags | 2.13.2 |
| block-buffer | 0.10.4 |
| camino | 1.2.6 |
| cargo-platform | 0.1.9 |
| cfg-if | 1.0.5 |
| chacha20 | 0.10.2 |
| chrono | 0.4.45 |
| cookie | 0.18.2 |
| cpufeatures | 0.2.17 |
| cpufeatures | 0.3.1 |
| crc32fast | 1.5.5 |
| crossbeam-channel | 0.5.17 |
| crossbeam-utils | 0.8.23 |
| crypto-common | 0.1.7 |
| data-url | 0.3.2 |
| deranged | 0.5.9 |
| digest | 0.10.7 |
| dirs | 7.0.0 |
| dirs-sys | 0.5.0 |
| displaydoc | 0.2.7 |
| dtoa | 1.0.11 |
| dyn-clone | 1.0.20 |
| erased-serde | 0.4.11 |
| fdeflate | 0.3.7 |
| flate2 | 1.1.11 |
| form_urlencoded | 1.2.2 |
| futures-channel | 0.3.34 |
| futures-core | 0.3.34 |
| futures-io | 0.3.34 |
| futures-macro | 0.3.34 |
| futures-sink | 0.3.34 |
| futures-task | 0.3.34 |
| futures-util | 0.3.34 |
| getrandom | 0.2.17 |
| getrandom | 0.3.4 |
| getrandom | 0.4.3 |
| glob | 0.3.4 |
| half | 2.7.1 |
| hashbrown | 0.12.3 |
| hashbrown | 0.17.1 |
| heck | 0.5.0 |
| hex | 0.4.3 |
| html5ever | 0.39.0 |
| http | 1.5.0 |
| httparse | 1.10.1 |
| idna | 1.1.0 |
| image | 0.25.10 |
| ipnet | 2.12.2 |
| itoa | 1.0.19 |
| jsonptr | 0.7.1 |
| keyboard-types | 0.8.3 |
| libc | 0.2.191 |
| lock_api | 0.4.14 |
| log | 0.4.35 |
| markup5ever | 0.39.0 |
| mime | 0.3.18 |
| num-conv | 0.2.2 |
| num-traits | 0.2.19 |
| once_cell | 1.21.4 |
| parking_lot | 0.12.5 |
| parking_lot_core | 0.9.12 |
| percent-encoding | 2.3.2 |
| png | 0.18.1 |
| powerfmt | 0.2.1 |
| proc-macro2 | 1.0.107 |
| quinn | 0.11.12 |
| quinn-proto | 0.11.19 |
| quinn-udp | 0.5.16 |
| quote | 1.0.47 |
| rand | 0.10.3 |
| rand_core | 0.10.1 |
| rand_pcg | 0.10.2 |
| ref-cast | 1.0.27 |
| ref-cast-impl | 1.0.27 |
| regex | 1.13.1 |
| regex-automata | 0.4.18 |
| regex-syntax | 0.8.11 |
| reqwest | 0.12.28 |
| reqwest | 0.13.5 |
| rustls-pki-types | 1.15.1 |
| rustls-platform-verifier | 0.7.1 |
| scopeguard | 1.2.0 |
| semver | 1.0.28 |
| serde | 1.0.229 |
| serde_core | 1.0.229 |
| serde_derive | 1.0.229 |
| serde_derive_internals | 0.29.1 |
| serde_json | 1.0.154 |
| serde_repr | 0.1.21 |
| serde_spanned | 1.1.3 |
| serde_with | 3.24.0 |
| serde_with_macros | 3.24.0 |
| serde-untagged | 0.1.9 |
| serialize-to-javascript | 0.1.2 |
| serialize-to-javascript-impl | 0.1.2 |
| servo_arc | 0.4.3 |
| sha2 | 0.10.9 |
| simdutf8 | 0.1.5 |
| siphasher | 1.0.4 |
| smallvec | 1.16.5 |
| socket2 | 0.6.5 |
| softbuffer | 0.4.8 |
| stable_deref_trait | 1.2.1 |
| string_cache | 0.9.0 |
| syn | 2.0.119 |
| syn | 3.0.10 |
| tempfile | 3.27.0 |
| tendril | 0.5.1 |
| thiserror | 2.0.21 |
| thiserror-impl | 2.0.21 |
| time | 0.3.55 |
| time-core | 0.1.9 |
| time-macros | 0.2.32 |
| tokio-rustls | 0.26.6 |
| toml | 1.2.1+spec-1.1.0 |
| toml_datetime | 1.1.3+spec-1.1.0 |
| toml_parser | 1.1.5+spec-1.1.0 |
| toml_writer | 1.2.0+spec-1.1.0 |
| tray-icon | 0.25.1 |
| typed-path | 0.13.0 |
| typeid | 1.0.3 |
| typenum | 1.20.1 |
| unicode-segmentation | 1.13.3 |
| url | 2.5.8 |
| web_atoms | 0.2.6 |
| web-time | 1.1.0 |
| weezl | 0.1.12 |
| windows | 0.62.2 |
| windows-collections | 0.3.2 |
| windows-core | 0.62.2 |
| windows-future | 0.3.2 |
| windows-implement | 0.60.2 |
| windows-interface | 0.59.3 |
| windows-link | 0.2.1 |
| windows-numerics | 0.3.1 |
| windows-registry | 0.6.1 |
| windows-result | 0.4.1 |
| windows-strings | 0.5.1 |
| windows-sys | 0.61.2 |
| windows-threading | 0.2.1 |
| windows-version | 0.1.7 |

#### MIT OR Apache-2.0 OR Zlib (4)

| Пакет | Версия | |
| --- | --- | --- |
| lru-slab | 0.1.3 |
| raw-window-handle | 0.6.2 |
| zune-core | 0.5.3 |
| zune-jpeg | 0.5.15 |

#### MIT OR Zlib OR Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| miniz_oxide | 0.8.9 |
| miniz_oxide | 0.9.1 |

#### MIT/Apache-2.0 (6)

| Пакет | Версия | |
| --- | --- | --- |
| bs58 | 0.5.1 |
| core_detect | 1.0.0 |
| ident_case | 1.0.1 |
| json-patch | 4.2.0 |
| quick-error | 2.0.1 |
| serde_urlencoded | 0.7.1 |

#### MPL-2.0 (5)

| Пакет | Версия | |
| --- | --- | --- |
| cssparser | 0.37.0 |
| cssparser-macros | 0.7.1 |
| dtoa-short | 0.3.5 |
| option-ext | 0.2.0 |
| selectors | 0.38.0 |

#### Unicode-3.0 (18)

| Пакет | Версия | |
| --- | --- | --- |
| icu_collections | 2.4.0 |
| icu_locale_core | 2.4.0 |
| icu_normalizer | 2.4.0 |
| icu_normalizer_data | 2.4.0 |
| icu_properties | 2.4.0 |
| icu_properties_data | 2.4.0 |
| icu_provider | 2.4.0 |
| litemap | 0.8.3 |
| potential_utf | 0.1.6 |
| tinystr | 0.8.5 |
| writeable | 0.6.4 |
| yoke | 0.8.4 |
| yoke-derive | 0.8.4 |
| zerofrom | 0.1.8 |
| zerofrom-derive | 0.1.8 |
| zerotrie | 0.2.5 |
| zerovec | 0.11.9 |
| zerovec-derive | 0.11.7 |

#### Unlicense OR MIT (9)

| Пакет | Версия | |
| --- | --- | --- |
| aho-corasick | 1.1.5 |
| byteorder | 1.5.0 |
| byteorder-lite | 0.1.0 |
| jiff | 0.2.42 |
| jiff-core | 0.1.4 |
| jiff-tzdb | 0.1.9 |
| jiff-tzdb-platform | 0.1.3 |
| memchr | 2.8.3 |
| winapi-util | 0.1.11 |

#### Unlicense/MIT (2)

| Пакет | Версия | |
| --- | --- | --- |
| same-file | 1.0.6 |
| walkdir | 2.5.0 |

#### Zlib (2)

| Пакет | Версия | |
| --- | --- | --- |
| foldhash | 0.2.0 |
| zlib-rs | 0.6.8 |

#### Zlib OR Apache-2.0 OR MIT (2)

| Пакет | Версия | |
| --- | --- | --- |
| bytemuck | 1.25.2 |
| tinyvec | 1.13.3 |

### Нативная часть: Телефон, Android TV — 300

#### (Apache-2.0 OR MIT) AND BSD-3-Clause (1)

| Пакет | Версия | |
| --- | --- | --- |
| encoding_rs | 0.8.44 |

#### (MIT OR Apache-2.0) AND Unicode-3.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| unicode-ident | 1.0.27 |

#### 0BSD OR MIT OR Apache-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| adler2 | 2.0.1 |

#### Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| sync_wrapper | 1.0.2 |
| tao | 0.37.2 |

#### Apache-2.0 / MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| fnv | 1.0.7 |

#### Apache-2.0 AND ISC (1)

| Пакет | Версия | |
| --- | --- | --- |
| ring | 0.17.14 |

#### Apache-2.0 AND MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| dpi | 0.1.2 |

#### Apache-2.0 OR BSL-1.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| ryu | 1.0.23 |

#### Apache-2.0 OR ISC OR MIT (2)

| Пакет | Версия | |
| --- | --- | --- |
| hyper-rustls | 0.27.10 |
| rustls | 0.23.46 |

#### Apache-2.0 OR MIT (32)

| Пакет | Версия | |
| --- | --- | --- |
| atomic-waker | 1.1.2 |
| bit-set | 0.11.1 |
| bit-set | 0.8.0 |
| bit-vec | 0.10.2 |
| bit-vec | 0.8.0 |
| ctor | 1.0.13 |
| equivalent | 1.0.3 |
| fastrand | 2.5.0 |
| idna_adapter | 1.2.2 |
| indexmap | 1.9.3 |
| indexmap | 2.14.2 |
| multiversion_no_op | 1.0.0 |
| pin-project-lite | 0.2.17 |
| rustc-hash | 2.1.3 |
| tauri | 2.12.5 |
| tauri-codegen | 2.7.4 |
| tauri-macros | 2.7.4 |
| tauri-plugin-clipboard-manager | 2.5.0 |
| tauri-plugin-dialog | 2.8.4 |
| tauri-plugin-fs | 2.7.1 |
| tauri-plugin-http | 2.9.0 |
| tauri-plugin-log | 2.10.2 |
| tauri-plugin-opener | 2.7.3 |
| tauri-plugin-store | 2.5.1 |
| tauri-runtime | 2.12.2 |
| tauri-runtime-wry | 2.12.3 |
| tauri-utils | 2.10.2 |
| utf_types | 1.0.0 |
| utf8_iter | 1.1.0 |
| uuid | 1.29.2 |
| wry | 0.57.2 |
| zeroize | 1.9.1 |

#### Apache-2.0/MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| cesu8 | 1.1.0 |

#### BSD-3-Clause (3)

| Пакет | Версия | |
| --- | --- | --- |
| alloc-no-stdlib | 3.0.0 |
| alloc-stdlib | 0.3.0 |
| subtle | 2.6.1 |

#### BSD-3-Clause AND MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| brotli | 9.1.1 |

#### BSD-3-Clause OR MIT OR Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| num_enum | 0.7.6 |
| num_enum_derive | 0.7.6 |

#### BSD-3-Clause/MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| brotli-decompressor | 6.3.1 |

#### CC0-1.0 OR MIT-0 OR Apache-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| dunce | 1.0.5 |

#### CDLA-Permissive-2.0 (1)

| Пакет | Версия | |
| --- | --- | --- |
| webpki-roots | 1.0.11 |

#### ISC (2)

| Пакет | Версия | |
| --- | --- | --- |
| rustls-webpki | 0.103.16 |
| untrusted | 0.9.0 |

#### MIT (59)

| Пакет | Версия | |
| --- | --- | --- |
| bytes | 1.12.1 |
| cargo_metadata | 0.19.2 |
| cfb | 0.14.0 |
| combine | 4.6.9 |
| darling | 0.24.1 |
| darling_core | 0.24.1 |
| darling_macro | 0.24.1 |
| derive_more | 2.1.1 |
| derive_more-impl | 2.1.1 |
| dom_query | 0.28.0 |
| dom_query | 0.29.0 |
| fern | 0.7.1 |
| generic-array | 0.14.7 |
| h2 | 0.4.20 |
| http-body | 1.1.0 |
| http-body-util | 0.1.5 |
| hyper | 1.12.0 |
| hyper-util | 0.1.21 |
| ico | 0.6.0 |
| infer | 0.22.0 |
| is-docker | 0.2.0 |
| is-wsl | 0.4.0 |
| mio | 1.2.4 |
| new_debug_unreachable | 1.0.6 |
| open | 5.4.5 |
| phf | 0.13.1 |
| phf | 0.14.0 |
| phf_generator | 0.13.1 |
| phf_generator | 0.14.0 |
| phf_macros | 0.13.1 |
| phf_macros | 0.14.0 |
| phf_shared | 0.13.1 |
| phf_shared | 0.14.0 |
| plist | 1.10.3 |
| precomputed-hash | 0.1.1 |
| quick-xml | 0.42.0 |
| schemars | 0.8.22 |
| schemars | 0.9.0 |
| schemars | 1.2.3 |
| schemars_derive | 0.8.22 |
| simd-adler32 | 0.3.10 |
| slab | 0.4.12 |
| strsim | 0.11.1 |
| synstructure | 0.14.0 |
| tokio | 1.54.1 |
| tokio-macros | 2.7.2 |
| tokio-util | 0.7.20 |
| tower | 0.5.3 |
| tower-http | 0.6.11 |
| tower-layer | 0.3.3 |
| tower-service | 0.3.3 |
| tracing | 0.1.44 |
| tracing-attributes | 0.1.31 |
| tracing-core | 0.1.36 |
| try-lock | 0.2.5 |
| urlpattern | 0.6.0 |
| want | 0.3.2 |
| winnow | 1.0.5 |
| zmij | 1.0.23 |

#### MIT OR Apache-2.0 (142)

| Пакет | Версия | |
| --- | --- | --- |
| android_log-sys | 0.3.2 |
| android_logger | 0.15.1 |
| android_system_properties | 0.1.6 |
| anyhow | 1.0.104 |
| base64 | 0.22.1 |
| base64 | 0.23.1 |
| bitflags | 2.13.2 |
| block-buffer | 0.10.4 |
| camino | 1.2.6 |
| cargo-platform | 0.1.9 |
| cfg-if | 1.0.5 |
| chacha20 | 0.10.2 |
| chrono | 0.4.45 |
| cookie | 0.18.2 |
| cpufeatures | 0.2.17 | только arm64
| crc32fast | 1.5.5 |
| crossbeam-channel | 0.5.17 |
| crossbeam-utils | 0.8.23 |
| crypto-common | 0.1.7 |
| data-url | 0.3.2 |
| deranged | 0.5.9 |
| digest | 0.10.7 |
| dirs | 7.0.0 |
| dirs-sys | 0.5.0 |
| displaydoc | 0.2.7 |
| dtoa | 1.0.11 |
| dyn-clone | 1.0.20 |
| env_filter | 0.1.4 |
| erased-serde | 0.4.11 |
| fdeflate | 0.3.7 |
| flate2 | 1.1.11 |
| form_urlencoded | 1.2.2 |
| futures-channel | 0.3.34 |
| futures-core | 0.3.34 |
| futures-io | 0.3.34 |
| futures-macro | 0.3.34 |
| futures-sink | 0.3.34 |
| futures-task | 0.3.34 |
| futures-util | 0.3.34 |
| getrandom | 0.2.17 |
| getrandom | 0.3.4 |
| getrandom | 0.4.3 |
| glob | 0.3.4 |
| hashbrown | 0.12.3 |
| hashbrown | 0.17.1 |
| heck | 0.5.0 |
| hex | 0.4.3 |
| html5ever | 0.39.0 |
| html5ever | 0.40.1 |
| http | 1.5.0 |
| httparse | 1.10.1 |
| iana-time-zone | 0.1.65 |
| idna | 1.1.0 |
| ipnet | 2.12.2 |
| itoa | 1.0.19 |
| jni-sys | 0.3.1 |
| jni-sys | 0.4.1 |
| jni-sys-macros | 0.4.1 |
| jsonptr | 0.7.1 |
| libc | 0.2.191 |
| lock_api | 0.4.14 |
| log | 0.4.35 |
| markup5ever | 0.39.0 |
| markup5ever | 0.40.0 |
| mime | 0.3.18 |
| ndk | 0.9.0 |
| ndk-context | 0.1.1 |
| ndk-sys | 0.6.0+11769913 |
| num_threads | 0.1.8 |
| num-conv | 0.2.2 |
| num-traits | 0.2.19 |
| once_cell | 1.21.4 |
| parking_lot | 0.12.5 |
| parking_lot_core | 0.9.12 |
| percent-encoding | 2.3.2 |
| png | 0.18.1 |
| powerfmt | 0.2.1 |
| proc-macro-crate | 3.5.0 |
| proc-macro2 | 1.0.107 |
| quinn | 0.11.12 |
| quinn-proto | 0.11.19 |
| quinn-udp | 0.5.16 |
| quote | 1.0.47 |
| rand | 0.10.3 |
| rand_core | 0.10.1 |
| rand_pcg | 0.10.2 |
| ref-cast | 1.0.27 |
| ref-cast-impl | 1.0.27 |
| regex | 1.13.1 |
| regex-automata | 0.4.18 |
| regex-syntax | 0.8.11 |
| reqwest | 0.12.28 |
| reqwest | 0.13.5 |
| rustls-pki-types | 1.15.1 |
| rustversion | 1.0.23 |
| scopeguard | 1.2.0 |
| semver | 1.0.28 |
| serde | 1.0.229 |
| serde_core | 1.0.229 |
| serde_derive | 1.0.229 |
| serde_derive_internals | 0.29.1 |
| serde_json | 1.0.154 |
| serde_repr | 0.1.21 |
| serde_spanned | 1.1.3 |
| serde_with | 3.24.0 |
| serde_with_macros | 3.24.0 |
| serde-untagged | 0.1.9 |
| serialize-to-javascript | 0.1.2 |
| serialize-to-javascript-impl | 0.1.2 |
| servo_arc | 0.4.3 |
| servo_arc | 0.5.0 |
| sha2 | 0.10.9 |
| simdutf8 | 0.1.5 | только arm64
| siphasher | 1.0.4 |
| smallvec | 1.16.5 |
| socket2 | 0.6.5 |
| stable_deref_trait | 1.2.1 |
| string_cache | 0.11.0 |
| string_cache | 0.9.0 |
| syn | 2.0.119 |
| syn | 3.0.10 |
| tao-macros | 0.1.4 |
| tendril | 0.5.1 |
| thiserror | 1.0.69 |
| thiserror | 2.0.21 |
| thiserror-impl | 1.0.69 |
| thiserror-impl | 2.0.21 |
| time | 0.3.55 |
| time-core | 0.1.9 |
| time-macros | 0.2.32 |
| tokio-rustls | 0.26.6 |
| toml | 1.2.1+spec-1.1.0 |
| toml_datetime | 1.1.3+spec-1.1.0 |
| toml_edit | 0.25.19+spec-1.1.0 |
| toml_parser | 1.1.5+spec-1.1.0 |
| toml_writer | 1.2.0+spec-1.1.0 |
| typeid | 1.0.3 |
| typenum | 1.20.1 |
| url | 2.5.8 |
| web_atoms | 0.2.6 |
| web_atoms | 0.3.0 |
| web-time | 1.1.0 |

#### MIT OR Apache-2.0 OR Zlib (2)

| Пакет | Версия | |
| --- | --- | --- |
| lru-slab | 0.1.3 |
| raw-window-handle | 0.6.2 |

#### MIT OR Zlib OR Apache-2.0 (2)

| Пакет | Версия | |
| --- | --- | --- |
| miniz_oxide | 0.8.9 |
| miniz_oxide | 0.9.1 |

#### MIT/Apache-2.0 (5)

| Пакет | Версия | |
| --- | --- | --- |
| bs58 | 0.5.1 |
| ident_case | 1.0.1 |
| jni | 0.21.1 |
| json-patch | 4.2.0 |
| serde_urlencoded | 0.7.1 |

#### MPL-2.0 (7)

| Пакет | Версия | |
| --- | --- | --- |
| cssparser | 0.37.0 |
| cssparser | 0.38.0 |
| cssparser-macros | 0.7.1 |
| dtoa-short | 0.3.5 |
| option-ext | 0.2.0 |
| selectors | 0.38.0 |
| selectors | 0.41.0 |

#### Unicode-3.0 (18)

| Пакет | Версия | |
| --- | --- | --- |
| icu_collections | 2.4.0 |
| icu_locale_core | 2.4.0 |
| icu_normalizer | 2.4.0 |
| icu_normalizer_data | 2.4.0 |
| icu_properties | 2.4.0 |
| icu_properties_data | 2.4.0 |
| icu_provider | 2.4.0 |
| litemap | 0.8.3 |
| potential_utf | 0.1.6 |
| tinystr | 0.8.5 |
| writeable | 0.6.4 |
| yoke | 0.8.4 |
| yoke-derive | 0.8.4 |
| zerofrom | 0.1.8 |
| zerofrom-derive | 0.1.8 |
| zerotrie | 0.2.5 |
| zerovec | 0.11.9 |
| zerovec-derive | 0.11.7 |

#### Unlicense OR MIT (5)

| Пакет | Версия | |
| --- | --- | --- |
| aho-corasick | 1.1.5 |
| byteorder | 1.5.0 |
| jiff | 0.2.42 |
| jiff-core | 0.1.4 |
| memchr | 2.8.3 |

#### Unlicense/MIT (2)

| Пакет | Версия | |
| --- | --- | --- |
| same-file | 1.0.6 |
| walkdir | 2.5.0 |

#### Zlib (2)

| Пакет | Версия | |
| --- | --- | --- |
| foldhash | 0.2.0 |
| zlib-rs | 0.6.8 |

#### Zlib OR Apache-2.0 OR MIT (1)

| Пакет | Версия | |
| --- | --- | --- |
| tinyvec | 1.13.3 |
