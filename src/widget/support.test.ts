import { describe, expect, it } from 'vitest'
import { widgetsSupported } from './support'

const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const EDGE_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('widgetsSupported', () => {
  it('is true for Microsoft Edge on Windows, the one place a web app can have a widget', () => {
    expect(widgetsSupported(EDGE_WINDOWS)).toBe(true)
  })

  it.each([
    ['Chrome on Windows', CHROME_WINDOWS],
    ['Firefox on Windows', FIREFOX_WINDOWS],
    ['Chrome on Android', CHROME_ANDROID],
    ['Edge on Android', EDGE_ANDROID],
    ['Safari on iPhone', SAFARI_IPHONE],
    ['no browser at all', ''],
  ])('is false for %s', (_name, ua) => {
    expect(widgetsSupported(ua)).toBe(false)
  })
})
