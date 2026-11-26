<script setup lang="ts">
import type { MediaLink } from '@/core/media-links'

import { canOpenOutside } from '../platform'
import { openDescriptionLink } from '../rich-open'

defineProps<{ links: readonly MediaLink[] }>()
</script>

<template>
  <nav v-if="links.length && canOpenOutside()" class="am-desc-links" aria-label="Источники">
    <a
      v-for="link in links"
      :key="link.key"
      v-tip="link.hint"
      href="#"
      @click.prevent="openDescriptionLink(link.url)"
    >
      {{ link.text }}
    </a>
  </nav>
</template>

<style scoped>
.am-desc-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.am-desc-links a {
  padding-block: 4px;
  color: var(--am-dim);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.am-desc-links a:focus-visible {
  color: var(--am-accent);
}
</style>
