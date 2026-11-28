import type { OnboardingAssets } from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import OnboardingSakura from './components/OnboardingSakura.vue'
import CreditsBox from './components/CreditsBox.vue'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets = {
  icon,
  credits: CreditsBox,
  desktop: { background: OnboardingSakura },
} satisfies OnboardingAssets
