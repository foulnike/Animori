import type { OnboardingAssets } from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import CreditsBox from './components/CreditsBox.vue'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets: OnboardingAssets = {
  icon,
  credits: CreditsBox,
}
