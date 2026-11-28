import type { OnboardingAssets } from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import OnboardingSakura from './components/OnboardingSakura.vue'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets = {
  icon,
  desktop: { background: OnboardingSakura },
} satisfies OnboardingAssets
