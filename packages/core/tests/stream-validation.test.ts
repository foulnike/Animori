import { describe, it, expect } from 'vitest'
import { validateStreamUrl, streamHost } from '@/utils/stream-validation'

describe('validateStreamUrl', () => {
  it('accepts kodik-cdn https', () => {
    expect(validateStreamUrl('https://s123.kodik-cdn.com/path/to/stream.m3u8').valid).toBe(true)
  })

  it('accepts solodcdn https', () => {
    expect(validateStreamUrl('https://cdn456.solodcdn.com/path/video.mp4').valid).toBe(true)
  })

  it('accepts anilibria.top https', () => {
    expect(validateStreamUrl('https://anilibria.top/videos/ts/123/720.mp4/index.m3u8').valid).toBe(
      true,
    )
  })

  it('accepts anilibria subdomain', () => {
    expect(validateStreamUrl('https://cache.anilibria.top/videos/720.m3u8').valid).toBe(true)
  })

  it('accepts animethemes subdomain', () => {
    expect(validateStreamUrl('https://v.animethemes.moe/Anime-OP1.webm').valid).toBe(true)
  })

  it('rejects http', () => {
    const result = validateStreamUrl('http://s123.kodik-cdn.com/stream.m3u8')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('https')
  })

  it('rejects unknown host', () => {
    const result = validateStreamUrl('https://evil.example/steal.m3u8')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('не в списке')
  })

  it('rejects userinfo', () => {
    const result = validateStreamUrl('https://user:pass@s123.kodik-cdn.com/stream.m3u8')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Логин/пароль')
  })

  it('rejects explicit port', () => {
    const result = validateStreamUrl('https://s123.kodik-cdn.com:8443/stream.m3u8')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('порт')
  })

  it('rejects data: scheme', () => {
    expect(validateStreamUrl('data:text/plain,hello').valid).toBe(false)
  })

  it('rejects javascript: scheme', () => {
    expect(validateStreamUrl('javascript:alert(1)').valid).toBe(false)
  })

  it('rejects file: scheme', () => {
    expect(validateStreamUrl('file:///path/to/video.mp4').valid).toBe(false)
  })

  it('rejects blob: scheme', () => {
    expect(validateStreamUrl('blob:http://localhost/abc-123').valid).toBe(false)
  })

  it('rejects too long URL', () => {
    const long = 'https://s123.kodik-cdn.com/' + 'x'.repeat(4100)
    const result = validateStreamUrl(long)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('слишком длинный')
  })

  it('rejects CR/LF', () => {
    const result = validateStreamUrl('https://s123.kodik-cdn.com/\r\nX-Header: evil')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Управляющие символы')
  })

  it('rejects bare domain without subdomain when wildcard requires one', () => {
    expect(validateStreamUrl('https://kodik-cdn.com/stream.m3u8').valid).toBe(false)
  })
})

describe('streamHost', () => {
  it('extracts hostname from valid URL', () => {
    expect(streamHost('https://s123.kodik-cdn.com/path/file.m3u8')).toBe('s123.kodik-cdn.com')
  })

  it('returns ? for invalid URL', () => {
    expect(streamHost('not a url')).toBe('?')
  })
})
