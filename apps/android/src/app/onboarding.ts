import {
  SHARED_GALLERIES,
  type OnboardingAssets,
} from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import listsMain from '../../../../packages/onboarding/assets/android/lists-main.webp'
import listsDetail from '../../../../packages/onboarding/assets/android/lists-detail.webp'
import playerFrame from '../../../../packages/onboarding/assets/android/player-frame.webp'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets: OnboardingAssets = {
  icon,
  mobilePlayerFrame: playerFrame,
  galleries: {
    ...SHARED_GALLERIES,
    lists: [
      { src: listsMain, caption: 'Мой список по статусам' },
      { src: listsDetail, caption: 'Строки списка и прогресс по сериям' },
    ],
  },
}
