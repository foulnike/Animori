# Зависимости

Интерфейсные зависимости перечислены в корневом `package-lock.json`, зависимости Rust — в `Cargo.lock` каждого приложения. Состав компонентов выпусков формирует `tools/gen-third-party.mjs`.

`docs/THIRD-PARTY.md` содержит перечень runtime-компонентов и лицензий; полные тексты лицензий выпускаются в `THIRD-PARTY-LICENSES.txt`.

Разрешённые лицензии Rust заданы в `deny.toml`. Версии `vitest` и `vue-tsc` указаны в `package.json` и манифестах приложений.
