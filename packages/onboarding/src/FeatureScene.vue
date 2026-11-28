<script setup lang="ts">
import { computed, useId } from 'vue'

import type { FeatureKey } from './content'

const props = defineProps<{
  scene: FeatureKey
  television: boolean
}>()

const id = useId()
const descriptions: Record<FeatureKey, string> = {
  player: 'Позиция на шкале плеера сохраняется, чтобы можно было продолжить просмотр.',
  lists: 'Запись переходит из списка «Смотрю» в список «Просмотрено».',
  transfer: 'Записи из профиля или файла добавляются в список AniMori.',
  cloud: 'Список сохраняется в облако и восстанавливается на другом устройстве.',
}

const televisionDescriptions: Partial<Record<FeatureKey, string>> = {
  transfer: 'Записи из профиля Шикимори добавляются в список AniMori.',
  cloud: 'Список восстанавливается на телевизоре из облачной копии.',
}

const description = computed(
  () =>
    (props.television ? televisionDescriptions[props.scene] : undefined) ??
    descriptions[props.scene],
)
</script>

<template>
  <figure class="am-scene" :data-scene="scene" role="img" :aria-label="description">
    <svg
      class="am-scene__art"
      viewBox="0 0 520 292"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient :id="id + '-halo'">
          <stop offset="0" class="am-scene__halo-core" />
          <stop offset="1" class="am-scene__halo-edge" />
        </radialGradient>
        <linearGradient :id="id + '-sky'" x2="0" y2="1">
          <stop offset="0" class="am-scene__sky-top" />
          <stop offset="1" class="am-scene__sky-bottom" />
        </linearGradient>
        <pattern :id="id + '-grid'" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" class="am-scene__grid-dot" />
        </pattern>
        <clipPath :id="id + '-screen'">
          <rect x="86" y="55" width="348" height="152" rx="9" />
        </clipPath>
      </defs>

      <ellipse cx="260" cy="148" rx="249" ry="142" :fill="'url(#' + id + '-halo)'" />
      <rect x="30" y="22" width="460" height="240" :fill="'url(#' + id + '-grid)'" />
      <path class="am-scene__frame-lines" d="M29 61V35h26m410 0h26v26M29 231v26h26m410 0h26v-26" />
      <path class="am-scene__spark" d="M52 96v12m-6-6h12m410 82v12m-6-6h12" />
      <circle cx="53" cy="204" r="2" class="am-scene__light" />
      <circle cx="468" cy="88" r="2" class="am-scene__light" />

      <template v-if="scene === 'player'">
        <rect x="74" y="37" width="372" height="218" rx="19" class="am-scene__panel" />
        <g :clip-path="'url(#' + id + '-screen)'">
          <rect x="86" y="55" width="348" height="152" :fill="'url(#' + id + '-sky)'" />
          <circle cx="333" cy="103" r="32" class="am-scene__moon" />
          <path
            class="am-scene__hill-back"
            d="M86 181l67-52 45 35 51-52 73 61 49-37 63 36v35H86Z"
          />
          <path
            class="am-scene__hill-front"
            d="m86 205 76-34 41 15 69-31 59 31 47-14 56 22v13H86Z"
          />
          <path
            class="am-scene__scene-detail"
            d="M100 124h48m-22 7h34m224-22h37m-50 7h31M102 199h58m217-3h44"
          />
          <path class="am-scene__spark" d="M189 85v12m-6-6h12m192 44v8m-4-4h8" />
          <circle cx="152" cy="104" r="2" class="am-scene__light" />
          <circle cx="357" cy="77" r="2" class="am-scene__light" />
        </g>
        <circle cx="260" cy="130" r="25" class="am-scene__player-button" />
        <path d="m254 119 17 11-17 11Z" class="am-scene__light" />
        <path d="M113 228h295" class="am-scene__track" />
        <path d="M113 228h208" class="am-scene__track-active am-scene__timeline" />
        <path
          d="M150 239h8m27 0h8m27 0h8m27 0h8m27 0h8m27 0h8m27 0h8m27 0h8"
          class="am-scene__muted-line"
        />
        <g class="am-scene__playhead">
          <circle cx="321" cy="228" r="6" class="am-scene__light" />
          <g class="am-scene__saved">
            <rect x="306" y="185" width="30" height="31" rx="8" class="am-scene__accent-panel" />
            <path d="M316 193h10v15l-5-4-5 4Z" class="am-scene__icon" />
          </g>
        </g>
      </template>

      <template v-else-if="scene === 'lists'">
        <rect x="62" y="48" width="178" height="184" rx="17" class="am-scene__panel" />
        <rect x="280" y="48" width="178" height="184" rx="17" class="am-scene__panel" />
        <path d="M62 100h178m40 0h178" class="am-scene__edge" />
        <circle cx="95" cy="74" r="14" class="am-scene__accent-wash" />
        <path d="m92 68 9 6-9 6Z" class="am-scene__light" />
        <circle cx="313" cy="74" r="14" class="am-scene__accent-wash" />
        <path d="m307 74 4 4 8-8" class="am-scene__icon" />
        <path d="M118 72h72m-72 7h46m172-7h72m-72 7h54" class="am-scene__muted-line" />
        <rect x="76" y="113" width="150" height="37" rx="8" class="am-scene__well" />
        <rect x="294" y="113" width="150" height="37" rx="8" class="am-scene__well" />
        <rect x="85" y="121" width="17" height="21" rx="4" class="am-scene__thumb" />
        <rect x="303" y="121" width="17" height="21" rx="4" class="am-scene__thumb" />
        <path d="M111 127h68m-68 9h43m175-9h72m-72 9h49" class="am-scene__muted-line" />
        <rect x="76" y="164" width="150" height="42" rx="9" class="am-scene__slot" />
        <rect x="294" y="164" width="150" height="42" rx="9" class="am-scene__slot" />
        <path d="M240 185h40" class="am-scene__route-guide" />
        <g class="am-scene__list-card">
          <rect x="294" y="164" width="150" height="42" rx="9" class="am-scene__accent-panel" />
          <rect x="303" y="173" width="19" height="24" rx="4" class="am-scene__thumb" />
          <path d="m305 190 6-7 5 5 4-4" class="am-scene__icon am-scene__icon-small" />
          <path d="M331 181h67m-67 8h43" class="am-scene__muted-line" />
          <path d="m415 185 4 4 8-8" class="am-scene__icon am-scene__completed" />
        </g>
      </template>

      <template v-else-if="scene === 'transfer'">
        <path d="M191 144h133" class="am-scene__route-guide" />
        <path d="m307 138 7 6-7 6" class="am-scene__icon" />
        <rect x="81" y="83" width="110" height="122" rx="16" class="am-scene__panel" />
        <rect x="324" y="72" width="115" height="144" rx="16" class="am-scene__panel" />
        <g v-if="television" data-import-source="profile">
          <rect x="96" y="114" width="80" height="52" rx="9" class="am-scene__accent-panel" />
          <rect x="102" y="120" width="36" height="40" rx="7" class="am-scene__well" />
          <circle cx="120" cy="133" r="6" class="am-scene__icon" />
          <path d="M110 153v-2a10 10 0 0 1 20 0v2Z" class="am-scene__icon" />
          <path d="M145 130h20m-20 10h16m-16 10h10" class="am-scene__muted-line" />
        </g>
        <g v-else>
          <path d="M119 116h22l12 12v29h-34Z" class="am-scene__icon" />
          <path d="M141 116v12h12m-26 10h17m-17 8h17" class="am-scene__icon am-scene__icon-small" />
        </g>
        <path d="M115 175h42m-34 8h26m217-86h31" class="am-scene__muted-line" />
        <g class="am-scene__import-packet">
          <rect x="289" y="136" width="16" height="16" rx="4" class="am-scene__accent-panel" />
          <path d="M294 144h6" class="am-scene__icon am-scene__icon-small" />
        </g>
        <g class="am-scene__import-rows">
          <rect x="336" y="112" width="91" height="24" rx="6" class="am-scene__well" />
          <rect x="336" y="143" width="91" height="24" rx="6" class="am-scene__well" />
          <rect x="336" y="174" width="91" height="24" rx="6" class="am-scene__accent-panel" />
          <path d="M361 124h45m-45 31h40m-40 31h39" class="am-scene__muted-line" />
          <path
            d="m343 124 3 3 6-6m-9 34 3 3 6-6m-9 34 3 3 6-6"
            class="am-scene__icon am-scene__icon-small"
          />
        </g>
      </template>

      <template v-else>
        <g v-if="television">
          <path d="M260 130v58" class="am-scene__route-guide" data-cloud-route="restore" />
          <path
            d="M260 130v58"
            pathLength="1"
            class="am-scene__route-lit am-scene__restore am-scene__restore--tv"
          />
        </g>
        <g v-else>
          <path
            d="M133 188v-18a13 13 0 0 1 13-13h70a14 14 0 0 0 14-14v-13"
            class="am-scene__route-guide"
            data-cloud-route="save"
          />
          <path
            d="M290 130v13a14 14 0 0 0 14 14h70a13 13 0 0 1 13 13v18"
            class="am-scene__route-guide"
            data-cloud-route="restore"
          />
          <path
            d="M133 188v-18a13 13 0 0 1 13-13h70a14 14 0 0 0 14-14v-13"
            pathLength="1"
            class="am-scene__route-lit am-scene__save"
          />
          <path
            d="M290 130v13a14 14 0 0 0 14 14h70a13 13 0 0 1 13 13v18"
            pathLength="1"
            class="am-scene__route-lit am-scene__restore"
          />
        </g>
        <rect x="200" y="43" width="120" height="87" rx="19" class="am-scene__accent-panel" />
        <path
          d="M244 103a11 11 0 0 1-1-22 18 18 0 0 1 34 3 10 10 0 1 1 1 19Z"
          class="am-scene__icon am-scene__cloud-icon"
        />
        <path d="M254 115h12" class="am-scene__muted-line" />
        <g v-if="!television" data-cloud-device="source">
          <rect x="81" y="188" width="104" height="59" rx="13" class="am-scene__panel" />
          <path d="M120 205h26v18h-26Zm8 24h10m-5-6v6" class="am-scene__icon" />
        </g>
        <g
          :transform="television ? 'translate(-127 0)' : undefined"
          data-cloud-device="destination"
        >
          <rect x="335" y="188" width="104" height="59" rx="13" class="am-scene__panel" />
          <path d="M374 204h26v19h-26Zm4 24h18" class="am-scene__icon" />
          <path d="m382 214 4 4 7-8" class="am-scene__icon am-scene__cloud-check" />
        </g>
      </template>
    </svg>
  </figure>
</template>

<style scoped src="./feature-scene.css"></style>
