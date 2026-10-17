import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // SFC в тестах: P2-17 гоняет axe по настоящей разметке экрана и модалки,
  // а не по собранному dist. Без плагина vite отказывается компилировать .vue.
  plugins: [vue()],
  resolve: {
    alias: {
      '@/api': fileURLToPath(new URL('../../packages/core/src/api', import.meta.url)),
      '@/bridge': fileURLToPath(new URL('../../packages/core/src/bridge', import.meta.url)),
      '@/core': fileURLToPath(new URL('../../packages/core/src/core', import.meta.url)),
      '@/utils': fileURLToPath(new URL('../../packages/core/src/utils', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Заглушка моста живёт с ядром: одна на оба продукта. Экранные наборы достают её
      // через этот псевдоним — своей копии у приложения нет и быть не должно.
      '@core-tests': fileURLToPath(new URL('../../packages/core/tests/mocks', import.meta.url)),
      '@bridge-impl': fileURLToPath(
        new URL('../../packages/core/tests/mocks/bridge.ts', import.meta.url),
      ),
      '@/bridge': fileURLToPath(
        new URL('../../packages/core/tests/mocks/bridge-module.ts', import.meta.url),
      ),
    },
  },
  define: {
    __ANIMORI_PLATFORM__: JSON.stringify('app'),
    __ANIMORI_VERSION__: JSON.stringify('test'),
    // Мост в проверках подменён заглушкой, но объявление остаётся: файл моста общий,
    // и ключ читается из него же. Значение — как в настоящей сборке этого продукта.
    __ANIMORI_SHELL_CAN__: JSON.stringify({
      browser: false,
      history: false,
      fullscreen: false,
      cast: false,
      devtools: false,
    }),
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
