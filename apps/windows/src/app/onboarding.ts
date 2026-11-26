import {
  SHARED_GALLERIES,
  type OnboardingAssets,
} from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import playerScreenshot from '../../../../packages/onboarding/assets/player.webp'
import listsMain from '../../../../packages/onboarding/assets/windows/lists-main.webp'
import listsDetail from '../../../../packages/onboarding/assets/windows/lists-detail.webp'
import OnboardingSakura from './components/OnboardingSakura.vue'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets = {
  icon,
  desktop: { background: OnboardingSakura },
  galleries: {
    ...SHARED_GALLERIES,
    player: [{ src: playerScreenshot, caption: 'Плеер, озвучки и список серий' }],
    lists: [
      { src: listsMain, caption: 'Мой список по статусам' },
      { src: listsDetail, caption: 'Оценки и статистика просмотров' },
    ],
  },
} satisfies OnboardingAssets
