import type { OnboardingAssets } from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import privacyCode from '../../../../packages/onboarding/assets/android-tv/privacy.png'
import repositoryCode from '../../../../packages/onboarding/assets/android-tv/repository.png'
import termsCode from '../../../../packages/onboarding/assets/android-tv/terms.png'
import { pushBackStop } from './back-stop'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets = {
  icon,
  television: {
    documentCodes: { terms: termsCode, privacy: privacyCode },
    repositoryCode,
    pushBackStop,
  },
} satisfies OnboardingAssets
