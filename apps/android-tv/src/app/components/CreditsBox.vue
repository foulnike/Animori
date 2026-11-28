<script setup lang="ts">
import { computed, ref } from 'vue'

import privacyCode from '../../../../../packages/onboarding/assets/android-tv/privacy.png'
import termsCode from '../../../../../packages/onboarding/assets/android-tv/terms.png'
import { DOCUMENTS } from '../../../../../packages/onboarding/src/legal'
import SettingsSheet from './SettingsSheet.vue'

const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const page = ref(0)
const documentId = ref<(typeof DOCUMENTS)[number]['id'] | null>(null)
const selected = computed(() => DOCUMENTS.find((doc) => doc.id === documentId.value))
const codes = { terms: termsCode, privacy: privacyCode }

const SOURCES = [
  { name: 'AniList', what: 'каталог, списки, расписание выхода' },
  { name: 'Шикимори', what: 'русские названия, описания, персонажи и авторы' },
  { name: 'Kodik, Anilibria', what: 'ссылки на видео' },
  { name: 'animori-data', what: 'база русских названий, CC0 1.0' },
]

function showCredits(): void {
  page.value = 0
  open.value = true
}
</script>

<template>
  <button ref="trigger" class="am-btn am-credits__btn" type="button" @click="showCredits">
    <svg
      class="am-credits__icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M10 2.5v15m-4 0h8M5 5h10M5 5l-3 7h6L5 5Zm10 0-3 7h6l-3-7ZM2 12a3 3 0 0 0 6 0m4 0a3 3 0 0 0 6 0"
      />
    </svg>
    Источники и права
  </button>

  <SettingsSheet
    :open="open"
    v-model:page="page"
    :page-count="2"
    :return-focus="() => trigger"
    title="Источники и права"
    icon="about"
    detail
    @close="open = false"
  >
    <dl v-if="page === 0" class="am-credits__sources">
      <div v-for="source in SOURCES" :key="source.name">
        <dt>{{ source.name }}</dt>
        <dd>{{ source.what }}</dd>
      </div>
    </dl>
    <template v-else>
      <p>
        Сведения об авторах описаний указаны у источников. Лицензии зависимостей перечислены в
        THIRD-PARTY.md.
      </p>
      <div class="am-credits__documents">
        <button
          v-for="doc in DOCUMENTS"
          :key="doc.id"
          class="am-btn"
          type="button"
          @click="documentId = doc.id"
        >
          {{ doc.title }}
        </button>
      </div>
    </template>

    <SettingsSheet
      :open="selected !== undefined"
      :title="selected?.title ?? ''"
      close-label="К источникам и правам"
      detail
      compact
      @close="documentId = null"
    >
      <div v-if="selected" class="am-credits__code">
        <img :src="codes[selected.id]" alt="QR-код документа" />
        <p>Отсканируйте QR-код телефоном.</p>
      </div>
    </SettingsSheet>
  </SettingsSheet>
</template>

<style scoped>
.am-credits__btn {
  min-height: 48px;
  padding-inline: 15px;
  white-space: normal;
}

.am-credits__icon {
  flex: 0 0 21px;
  width: 21px;
  height: 21px;
}

.am-credits__sources,
p {
  margin: 0;
}

.am-credits__sources > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.65fr);
  align-items: baseline;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--am-line-soft);
}

.am-credits__sources dd {
  margin: 0;
  color: var(--am-dim);
  text-align: right;
}

.am-credits__documents {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.am-credits__documents .am-btn {
  min-height: 44px;
  white-space: normal;
}

.am-credits__code {
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
}

.am-credits__code img {
  display: block;
  width: min(100%, 174px);
  height: auto;
  border-radius: 5px;
}
</style>
