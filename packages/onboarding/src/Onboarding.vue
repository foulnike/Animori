<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { Bridge } from '@/bridge'
import { Logger } from '@/utils/logger'

import closingPhoto from '../assets/foulnike-joke.jpg'
import { PROVIDERS, REPOSITORY, SLIDES, TV_FEATURE_SLIDES, type OnboardingAssets } from './content'
import { completeOnboarding } from './first-launch'
import FeatureScene from './FeatureScene.vue'

const props = defineProps<OnboardingAssets>()
const emit = defineEmits<{ complete: [] }>()

const step = ref(0)
const agreed = ref(false)
const saving = ref(false)
const saveError = ref('')
const linkError = ref('')
const content = ref<HTMLElement | null>(null)
const title = ref<HTMLHeadingElement | null>(null)
const previousButton = ref<HTMLButtonElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)
const credits = ref<HTMLElement | null>(null)
const consent = ref<HTMLInputElement | null>(null)

const slide = computed(() => {
  const current = SLIDES[step.value] ?? SLIDES[0]
  if (!props.television || current.kind !== 'feature') return current
  return TV_FEATURE_SLIDES[current.scene] ?? current
})
const last = computed(() => step.value === SLIDES.length - 1)
const nextDisabled = computed(
  () => saving.value || ((slide.value.kind === 'agreement' || last.value) && !agreed.value),
)

function focusStep(direction: -1 | 1): void {
  if (!props.television) {
    title.value?.focus({ preventScroll: true })
    return
  }

  const target =
    slide.value.kind === 'agreement' && !agreed.value
      ? consent.value
      : direction < 0 && step.value > 0
        ? previousButton.value
        : nextButton.value
  target?.focus({ preventScroll: true })
}

function onConsentEnter(event: KeyboardEvent): void {
  if (!props.television) return
  event.preventDefault()
  if (!event.repeat) agreed.value = !agreed.value
}

function focusAgreementControl(event: KeyboardEvent, target: HTMLElement | null): void {
  if (!props.television || !target) return
  event.preventDefault()
  event.stopPropagation()
  target.focus()
}

function onContentDown(event: KeyboardEvent): void {
  if (!props.television) return
  event.preventDefault()
  event.stopPropagation()
  const target = nextDisabled.value ? previousButton.value : nextButton.value
  target?.focus({ preventScroll: true })
}

function onActionsArrow(event: KeyboardEvent, direction: -1 | 1): void {
  if (!props.television) return
  event.preventDefault()
  event.stopPropagation()
  if (direction < 0 && consent.value) {
    consent.value.focus()
    return
  }
  const body = content.value
  if (body && body.scrollHeight > body.clientHeight) {
    body.scrollBy({ top: direction * body.clientHeight * 0.75 })
  }
}

let releaseBack: (() => void) | undefined
watch(step, (index) => {
  if (index === 0) {
    releaseBack?.()
    releaseBack = undefined
  } else {
    releaseBack ??= props.television?.pushBackStop(() => {
      void move(-1)
      return true
    })
  }
})
onMounted(() => {
  if (props.television) focusStep(1)
})
onBeforeUnmount(() => releaseBack?.())

async function move(direction: -1 | 1): Promise<void> {
  if (saving.value || (direction > 0 && nextDisabled.value)) return
  const target = step.value + direction
  if (target < 0 || target >= SLIDES.length) return
  step.value = target
  linkError.value = ''
  saveError.value = ''
  await nextTick()
  if (content.value) content.value.scrollTop = 0
  focusStep(direction)
}

async function openLink(url: string): Promise<void> {
  linkError.value = ''
  try {
    await Bridge.shell.openExternal(url)
  } catch (error) {
    Logger('WARN', 'Онбординг: ссылка не открылась', error)
    linkError.value = 'Не удалось открыть ссылку. Попробуйте ещё раз.'
  }
}

async function next(): Promise<void> {
  if (nextDisabled.value) return
  if (!last.value) {
    await move(1)
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    await completeOnboarding()
    emit('complete')
  } catch (error) {
    Logger('ERROR', 'Онбординг: не удалось сохранить согласие', error)
    saveError.value = 'Не удалось сохранить согласие. Попробуйте ещё раз.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main
    class="am-intro"
    :class="{ 'am-intro--desktop': desktop, 'am-intro--television': television }"
    aria-labelledby="am-intro-title"
  >
    <component :is="desktop.background" v-if="desktop" />
    <div class="am-intro__card">
      <div ref="content" class="am-intro__scroll" @keydown.down="onContentDown">
        <div class="am-intro__slide" :class="'am-intro__slide--' + slide.kind">
          <img v-if="slide.kind === 'welcome'" class="am-intro__logo" :src="icon" alt="" />
          <div class="am-intro__copy">
            <p v-if="slide.kind === 'feature'" class="am-intro__label">Что мы умеем</p>
            <h1 id="am-intro-title" ref="title" tabindex="-1">{{ slide.title }}</h1>

            <template v-if="slide.kind === 'welcome'">
              <p>Спасибо, что скачали приложение!</p>
              <p>
                Это бесплатный аниме-кинотеатр с открытым исходным кодом, без рекламы и телеметрии.
                Здесь можно найти и смотреть аниме, а также вести свой список.
              </p>
            </template>

            <template v-else-if="slide.kind === 'feature'">
              <p>{{ slide.description }}</p>
            </template>

            <template v-else-if="slide.kind === 'providers'">
              <ul class="am-intro__providers">
                <li v-for="provider in PROVIDERS" :key="provider.title">
                  <strong v-if="television">{{ provider.title }}</strong>
                  <a v-else :href="provider.url" @click.prevent="openLink(provider.url)">
                    {{ provider.title }} <span aria-hidden="true">↗</span>
                  </a>
                  <span>
                    {{
                      television && provider.title === 'AniList'
                        ? 'Каталог и расписание'
                        : provider.description
                    }}
                  </span>
                  <span v-if="television" class="am-intro__provider-address">
                    {{ provider.url.replace('https://', '').replace(/\/$/, '') }}
                  </span>
                </li>
              </ul>
            </template>

            <template v-else-if="slide.kind === 'agreement'">
              <div ref="credits" @keydown.down="focusAgreementControl($event, consent)">
                <component :is="props.credits" />
              </div>
              <label class="am-intro__consent">
                <input
                  ref="consent"
                  v-model="agreed"
                  type="checkbox"
                  @keydown.enter="onConsentEnter"
                  @keydown.up="
                    focusAgreementControl($event, credits?.querySelector('button') ?? null)
                  "
                />
                <span>
                  Я принимаю Условия использования и подтверждаю, что ознакомился с Политикой
                  обработки персональных данных.
                </span>
              </label>
            </template>

            <template v-else>
              <div class="am-intro__closing">
                <div class="am-intro__support">
                  <p>
                    AniMori — некоммерческий проект, который я развиваю в свободное время. Иногда за
                    маленьким улучшением стоит целый вечер работы. И когда кто-то ставит звёздочку
                    или рассказывает о приложении другу, я понимаю, что этот вечер был не зря. Ваша
                    поддержка помогает AniMori жить и развиваться.
                  </p>
                  <figure v-if="television" class="am-intro__qr-repository">
                    <img :src="television.codes[REPOSITORY]" alt="" />
                    <figcaption>Поставьте звёздочку на GitHub</figcaption>
                  </figure>
                  <a
                    v-else
                    class="am-intro__repository"
                    :href="REPOSITORY"
                    @click.prevent="openLink(REPOSITORY)"
                  >
                    Поставьте звёздочку на GitHub <span aria-hidden="true">↗</span>
                  </a>
                </div>
                <figure class="am-intro__joke">
                  <blockquote>
                    <p>
                      «А КОГДА ПРОЕКТ СТАНЕТ ПОПУЛЯРНЫМ, Я ДОБАВЛЮ КУЧУ РЕКЛАМЫ И ПЛАТНУЮ ПОДПИСКУ,
                      НАЧНУ СОБИРАТЬ ДАННЫЕ ПОЛЬЗОВАТЕЛЕЙ И ПРОДАВАТЬ ИХ В КИТАЙ, ЗАШЬЮ В
                      УСТАНОВЩИКИ МАЙНЕР И РАЗБОГАТЕЮ!!! Погодите, что значит „исходники открыты“?»
                    </p>
                    <footer>— foulnike</footer>
                  </blockquote>
                  <img :src="closingPhoto" alt="Планктон в костюме с серьёзным выражением лица" />
                </figure>
              </div>
            </template>
            <p v-if="linkError" class="am-intro__error" role="status">{{ linkError }}</p>
          </div>

          <div v-if="slide.kind === 'feature'" class="am-intro__feature-art">
            <FeatureScene
              :key="slide.scene"
              :scene="slide.scene"
              :television="Boolean(television)"
            />
          </div>
        </div>
      </div>

      <footer class="am-intro__footer">
        <p v-if="saveError" class="am-intro__error" role="alert">{{ saveError }}</p>
        <div class="am-intro__position">
          <span>Шаг {{ step + 1 }} из {{ SLIDES.length }}</span>
          <span
            class="am-intro__steps"
            :aria-hidden="television ? undefined : 'true'"
            :role="television ? 'progressbar' : undefined"
            :aria-label="television ? 'Прохождение знакомства' : undefined"
            :aria-valuemin="television ? 0 : undefined"
            :aria-valuenow="television ? step + 1 : undefined"
            :aria-valuemax="television ? SLIDES.length : undefined"
          >
            <i
              v-for="(item, index) in SLIDES"
              :key="item.title"
              :class="{
                'am-intro__step--done': index < step,
                'am-intro__step--here': index === step,
              }"
            />
          </span>
        </div>
        <progress
          v-if="!television"
          :value="step + 1"
          :max="SLIDES.length"
          aria-label="Прохождение знакомства"
        />
        <div
          class="am-intro__actions"
          @keydown.up="onActionsArrow($event, -1)"
          @keydown.down="onActionsArrow($event, 1)"
        >
          <button
            ref="previousButton"
            class="am-btn am-btn--ghost"
            :class="{ 'am-intro__arrow': television }"
            type="button"
            :aria-label="television ? 'Предыдущий слайд' : undefined"
            :disabled="step === 0 || saving"
            @click="move(-1)"
          >
            <svg
              v-if="television"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5 M12 5l-7 7 7 7" />
            </svg>
            <template v-else>Предыдущий</template>
          </button>
          <button
            ref="nextButton"
            class="am-intro__next"
            :class="{ 'am-intro__arrow': television && !last }"
            type="button"
            :aria-label="television && !last ? 'Следующий слайд' : undefined"
            :disabled="nextDisabled"
            @click="next"
          >
            <svg
              v-if="television && !last"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14 M12 5l7 7-7 7" />
            </svg>
            <template v-else>{{ last ? 'Открыть AniMori' : 'Следующий' }}</template>
          </button>
        </div>
      </footer>
    </div>
  </main>
</template>

<style scoped src="./onboarding.css"></style>
<style scoped src="./onboarding-tv.css"></style>
