import { describe, expect, it } from 'vitest'
import { appName, DEFAULT_APP_IDS, idsFromNative, PAYMENT_APPS, toNativeApps } from './apps'

describe('the payment apps', () => {
  it('have each package in one app only, and a name and a line of explanation', () => {
    const packages = PAYMENT_APPS.flatMap((a) => a.packages)
    expect(new Set(packages).size).toBe(packages.length)
    for (const app of PAYMENT_APPS) {
      expect(app.name).not.toBe('')
      expect(app.detail).not.toBe('')
      expect(app.packages.length).toBeGreaterThan(0)
    }
  })

  it('start with the payment apps on and the messages app off', () => {
    expect(DEFAULT_APP_IDS).toEqual(['phonepe', 'gpay', 'cred', 'paytm', 'bhim'])
    expect(DEFAULT_APP_IDS).not.toContain('messages')
  })
})

describe('toNativeApps', () => {
  it('has one entry for each package of each app that is on, with its name', () => {
    expect(toNativeApps(['phonepe'])).toEqual([{ package: 'com.phonepe.app', name: 'PhonePe', sms: false }])
  })

  it('marks the messages app, which has a package for each phone maker', () => {
    const apps = toNativeApps(['messages'])
    expect(apps.length).toBeGreaterThan(1)
    expect(apps.every((a) => a.sms && a.name === 'Bank messages')).toBe(true)
  })

  it('is empty when nothing is on, and ignores ids it does not know', () => {
    expect(toNativeApps([])).toEqual([])
    expect(toNativeApps(['nope'])).toEqual([])
  })
})

describe('idsFromNative', () => {
  it('gives back which apps are on, in the usual order', () => {
    expect(idsFromNative(toNativeApps(['cred', 'phonepe', 'messages']))).toEqual(['phonepe', 'cred', 'messages'])
  })

  it('counts an app as on when any of its packages is', () => {
    expect(idsFromNative([{ package: 'com.samsung.android.messaging' }])).toEqual(['messages'])
  })

  it('ignores packages it does not know', () => {
    expect(idsFromNative([{ package: 'com.example.other' }])).toEqual([])
    expect(idsFromNative([])).toEqual([])
  })
})

describe('appName', () => {
  it('names the app for a package, and says a payment app when it does not know', () => {
    expect(appName('com.phonepe.app')).toBe('PhonePe')
    expect(appName('net.one97.paytm')).toBe('Paytm')
    expect(appName('com.example.unknown')).toBe('a payment app')
  })
})
