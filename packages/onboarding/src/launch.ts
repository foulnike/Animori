import { createApp } from 'vue'

import Onboarding from './Onboarding.vue'
import type { OnboardingAssets } from './content'

export function showOnboarding(
  root: HTMLElement,
  assets: OnboardingAssets,
  shown: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    const app = createApp(Onboarding, {
      ...assets,
      onComplete() {
        app.unmount()
        resolve()
      },
    })
    app.mount(root)
    shown()
  })
}
