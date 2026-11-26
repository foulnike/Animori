import { Bridge } from '@/bridge'

const COMPLETED_KEY = 'am_onboarding_completed'
// До появления онбординга приложения записывали круг приветствий при запуске.
const PREVIOUS_LAUNCH_KEY = 'am_splash_round'

export async function needsOnboarding(): Promise<boolean> {
  const [completed, previousLaunch] = await Promise.all([
    Bridge.storage.get<boolean>(COMPLETED_KEY),
    Bridge.storage.get(PREVIOUS_LAUNCH_KEY),
  ])
  return completed !== true && previousLaunch === undefined
}

export async function completeOnboarding(): Promise<void> {
  await Bridge.storage.set(COMPLETED_KEY, true)
}
