import { REPOSITORY, type OnboardingAssets } from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import repositoryCode from '../../../../packages/onboarding/assets/android-tv/repository.png'
import { pushBackStop } from './back-stop'
import CreditsBox from './components/CreditsBox.vue'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets = {
  icon,
  credits: CreditsBox,
  television: {
    codes: {
      [REPOSITORY]: repositoryCode,
    },
    pushBackStop,
  },
} satisfies OnboardingAssets
