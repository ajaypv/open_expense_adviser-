import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

beforeEach(() => {
  vi.resetModules()
})

async function load(storage = fakeStorage()) {
  vi.stubGlobal('localStorage', storage)
  // Import money after the reset so it is the same copy the preferences module acts on.
  const money = await import('../db/money')
  const display = await import('./display')
  return { storage, formatMoney: money.formatMoney, setNumberFormat: money.setNumberFormat, ...display }
}

describe('display preferences', () => {
  it('start from sensible defaults', async () => {
    const { getDisplay } = await load()
    expect(getDisplay()).toEqual({ numberFormat: 'auto', privacy: false, textSize: 'default' })
  })

  it('apply saved privacy mode before anything renders, so amounts never flash', async () => {
    const { formatMoney } = await load(fakeStorage({ 'display-prefs': JSON.stringify({ privacy: true }) }))
    expect(formatMoney(45000, 'INR')).toBe('₹••••')
  })

  it('persist changes and act on them straight away', async () => {
    const { setDisplay, getDisplay, storage, formatMoney } = await load()
    setDisplay({ privacy: true })
    expect(formatMoney(45000, 'INR')).toBe('₹••••')
    setDisplay({ privacy: false, numberFormat: 'indian' })
    expect(formatMoney(12_345_600, 'INR')).toBe('₹1,23,456')
    expect(JSON.parse(storage.data.get('display-prefs')!)).toMatchObject({ privacy: false, numberFormat: 'indian' })
    expect(getDisplay().numberFormat).toBe('indian')
  })

  it('ignore unknown or corrupt stored values', async () => {
    const { getDisplay } = await load(fakeStorage({ 'display-prefs': JSON.stringify({ numberFormat: 'martian', textSize: 99, privacy: 'yes' }) }))
    expect(getDisplay()).toEqual({ numberFormat: 'auto', privacy: false, textSize: 'default' })
    const broken = await load(fakeStorage({ 'display-prefs': '{not json' }))
    expect(broken.getDisplay().textSize).toBe('default')
  })

  it('survive storage being unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    vi.resetModules()
    const { getDisplay, setDisplay } = await import('./display')
    expect(getDisplay().textSize).toBe('default')
    expect(() => setDisplay({ textSize: 'large' })).not.toThrow()
    expect(getDisplay().textSize).toBe('large')
  })
})
