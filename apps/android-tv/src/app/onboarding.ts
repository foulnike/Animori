import {
  DOCUMENTS,
  REPOSITORY,
  SHARED_GALLERIES,
  type OnboardingAssets,
} from '../../../../packages/onboarding/src/content'
import icon from '../../src-tauri/icons/128x128@2x.png'
import player from '../../../../packages/onboarding/assets/player.webp'
import listsMain from '../../../../packages/onboarding/assets/windows/lists-main.webp'
import transfer from '../../../../packages/onboarding/assets/android-tv/transfer.webp'
import cloud from '../../../../packages/onboarding/assets/android-tv/cloud.webp'
import termsCode from '../../../../packages/onboarding/assets/android-tv/terms.png'
import privacyCode from '../../../../packages/onboarding/assets/android-tv/privacy.png'
import repositoryCode from '../../../../packages/onboarding/assets/android-tv/repository.png'
import { pushBackStop } from './back-stop'

export { showOnboarding } from '../../../../packages/onboarding/src/launch'

export const assets = {
  icon,
  galleries: {
    ...SHARED_GALLERIES,
    player: [{ src: player, caption: 'Плеер, озвучки и список серий' }],
    lists: [{ src: listsMain, caption: 'Мой список по статусам' }],
    transfer: [{ src: transfer, caption: 'Импорт списка из профиля Шикимори' }],
    cloud: [{ src: cloud, caption: 'Восстановление списка по ссылке на ТВ' }],
  },
  television: {
    codes: {
      [DOCUMENTS[0].url]: termsCode,
      [DOCUMENTS[1].url]: privacyCode,
      [REPOSITORY]: repositoryCode,
    },
    pushBackStop,
  },
} satisfies OnboardingAssets
