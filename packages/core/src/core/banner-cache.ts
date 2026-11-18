import { Bridge } from '@/bridge'
import { fetchMediaCard, type MediaCard } from '../api/anilist-media'
import { getRussianTitle, type RussianTitle } from './media-title'

export interface ReadyBanner {
  card: MediaCard
  title: RussianTitle | null
  image: string
}

// Module lifetime is the application session, including navigation away from Home.
const ready = new Map<number, ReadyBanner>()
const pending = new Map<number, Promise<ReadyBanner>>()
const images = new Map<string, Promise<string>>()

export function peekBanner(id: number): ReadyBanner | null {
  return ready.get(id) ?? null
}

async function loadImage(url: string): Promise<string> {
  const response = await Bridge.http.requestBytes({ url, timeoutMs: 20000 })
  if (!response.ok) throw new Error('Banner image unavailable')
  const raw = response.bytesBase64.split(',').pop() ?? ''
  const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0))
  if (bytes.length === 0) throw new Error('Empty banner image')
  const local = URL.createObjectURL(
    new Blob([bytes], {
      type: response.headers['content-type'] ?? 'image/jpeg',
    }),
  )
  try {
    const image = new Image()
    image.src = local
    await image.decode()
    return local
  } catch (error) {
    URL.revokeObjectURL(local)
    throw error
  }
}

function warmImage(url: string): Promise<string> {
  const cached = images.get(url)
  if (cached) return cached
  const task = loadImage(url).catch((error) => {
    images.delete(url)
    throw error
  })
  images.set(url, task)
  return task
}

export function warmBanner(id: number): Promise<ReadyBanner> {
  const cached = ready.get(id)
  if (cached) return Promise.resolve(cached)
  const running = pending.get(id)
  if (running) return running
  const task = (async () => {
    const [card, translated] = await Promise.all([fetchMediaCard(id), getRussianTitle(id)])
    if (!card || translated.state === 'fail') throw new Error('Banner data incomplete')
    const candidates = [...new Set([card.banner, card.cover].filter((url): url is string => !!url))]
    for (const url of candidates) {
      try {
        const image = await warmImage(url)
        const banner = { card, title: translated.title, image }
        ready.set(id, banner)
        return banner
      } catch {
        // A missing wide banner can fall back to a fully decoded cover.
      }
    }
    throw new Error('No banner image loaded')
  })().finally(() => pending.delete(id))
  pending.set(id, task)
  return task
}
